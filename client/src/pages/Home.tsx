import { useAuth } from "@/_core/hooks/useAuth";
import { AuthDialog } from "@/components/AuthDialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  rectifyDataUrl,
} from "@/lib/cardVision";
import {
  OCR_MODES,
  assessOcrImageQuality,
  recognizeCardName,
  type OcrMode,
} from "@/lib/cardOcr";
import { formatDeckExport } from "@/lib/deckExport";
import { parseCollectionCsv } from "@/lib/collectionCsv";
import { CATALOG_CARDS, COLOR_META, type CardColor, type CatalogCard, validateDeck } from "@shared/deckRules";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Activity as ActivityIcon, Camera, Check, ChevronLeft, ChevronRight, CircleDollarSign, Clipboard, Crosshair, Database, Download, ExternalLink, FolderKanban, Grid2X2, LayoutDashboard, LogIn, Minus, Package, Plus, RefreshCw, ScanLine, Share2, ShieldCheck, Sparkles, Upload, X, Zap } from "lucide-react";
import { getCardArtUrl } from "@/lib/cardArt";
import { loadCardDetails, formatRulesText, type CardDetails } from "@/lib/cardDetails";

type View = "overview" | "scanner" | "collection" | "decks" | "prices" | "activity";
type StrategyGoal = "aggro" | "control" | "midrange" | "tempo";

const STRATEGY_GOALS: Array<{ id: StrategyGoal; label: string; detail: string }> = [
  { id: "aggro", label: "Aggro", detail: "Fast pressure" },
  { id: "control", label: "Control", detail: "Answers and value" },
  { id: "midrange", label: "Midrange", detail: "Threats plus answers" },
  { id: "tempo", label: "Tempo", detail: "Efficient disruption" },
];

const WEIGHT_PRESETS: Array<{ id: string; label: string; detail: string; goals: StrategyGoal[]; weights: { speed: number; control: number; budget: number } }> = [
  { id: "budget-aggro", label: "Budget Aggro", detail: "Fast, low-cost pressure", goals: ["aggro"], weights: { speed: 85, control: 25, budget: 10 } },
  { id: "high-control", label: "High-Control", detail: "Resilient answers and value", goals: ["control"], weights: { speed: 25, control: 90, budget: 65 } },
  { id: "balanced-midrange", label: "Balanced Midrange", detail: "Flexible all-rounder", goals: ["midrange"], weights: { speed: 50, control: 50, budget: 50 } },
  { id: "tempo-efficiency", label: "Tempo Efficiency", detail: "Pressure with disruption", goals: ["tempo"], weights: { speed: 70, control: 60, budget: 35 } },
];

type ComparableDeck = { legends: Array<{ cardId: number; quantity: number }>; main: Array<{ cardId: number; quantity: number }> };
function comparisonRows(results: ComparableDeck[], cards: CatalogCard[]) {
  const ids = new Set(results.flatMap((result) => [...result.legends, ...result.main].map((line) => line.cardId)));
  return Array.from(ids).map((id) => ({ card: cards.find((card) => card.id === id), quantities: results.map((result) => [...result.legends, ...result.main].find((line) => line.cardId === id)?.quantity ?? 0) })).filter((row): row is { card: CatalogCard; quantities: number[] } => Boolean(row.card));
}

const nav = [
  { id: "overview" as View, label: "Command center", icon: LayoutDashboard },
  { id: "scanner" as View, label: "Card scanner", icon: ScanLine },
  { id: "collection" as View, label: "My collection", icon: Package },
  { id: "decks" as View, label: "Deck lab", icon: FolderKanban },
  { id: "prices" as View, label: "Price watch", icon: CircleDollarSign },
  { id: "activity" as View, label: "Recent activity", icon: ActivityIcon },
];

function money(cents: number | null | undefined = 0) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format((cents ?? 0) / 100);
}

function cardTone(color: string) {
  const value = COLOR_META[color as CardColor]?.hex ?? "#b9f36b";
  return { borderColor: `${value}55`, background: `linear-gradient(145deg, ${value}24, rgba(9,11,17,.96) 58%)`, color: value };
}

function MiniCard({
  card,
  quantity,
  onAdd,
  onRemove,
  onOpen,
}: {
  card: CatalogCard;
  quantity?: number;
  onAdd?: () => void;
  onRemove?: () => void;
  onOpen?: () => void;
}) {
  const [details, setDetails] = useState<CardDetails>();

  useEffect(() => {
    let cancelled = false;

    void loadCardDetails().then((allDetails) => {
      if (!cancelled) {
        setDetails(allDetails[card.id]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [card.id]);

  const classifications = details?.classifications ?? [];
  const keywords = details?.keywords ?? [];
  const rulesText = details?.rulesText
    ? formatRulesText(details.rulesText)
    : "";

  return (
    <div
      className="mini-card"
      style={{
        ...cardTone(card.color),
        cursor: onOpen ? "pointer" : undefined,
      }}
      onClick={onOpen}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={(event) => {
        if (onOpen && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="mini-card-image-wrap">
        <img
          src={getCardArtUrl(card)}
          alt={card.name}
          className="mini-card-image"
          loading="lazy"
        />

        {quantity !== undefined && (
          <span className="mini-card-quantity-badge">
            ×{quantity}
          </span>
        )}
      </div>

      <div className="mini-card-content">
        <div className="mini-card-top">
          <span className="mini-card-kind">
            {details?.cardType ?? card.kind}
          </span>

          {card.ram !== undefined && (
            <span className="ram-chip">RAM {card.ram}</span>
          )}
        </div>

        <h3 className="mini-card-name">{card.name}</h3>

        <div className="mini-card-sub">
          {classifications.length > 0
            ? classifications.join(", ")
            : card.subtitle ?? card.rarity}
        </div>

        {keywords.length > 0 && (
          <div className="mini-card-keywords">
            {keywords.map((keyword) => (
              <span key={keyword}>{keyword}</span>
            ))}
          </div>
        )}

        {rulesText && (
          <div className="mini-card-rules">
            {rulesText.split("\n").map((line, index) => (
              <p key={`${card.id}-rule-${index}`}>{line}</p>
            ))}
          </div>
        )}

        {details?.flavorText && (
          <div className="mini-card-flavor">
            {details.flavorText}
          </div>
        )}

        <div className="mini-card-meta">
          <span>{card.rarity}</span>
          <span>
            {card.edition === "beta" ? "Beta" : "Retail"}
            {card.collectorNumber
              ? ` · ${card.collectorNumber}`
              : ""}
          </span>
          <span>{card.setName}</span>
        </div>

        <div className="mini-card-stats">
          {card.cost !== undefined && (
            <span>{card.cost} EDDIES</span>
          )}

          {card.power !== undefined && (
            <span>{card.power} PWR</span>
          )}
        </div>

        {quantity !== undefined && (
          <div
            className="quantity-row"
            onClick={(event) => event.stopPropagation()}
          >
            <span>In collection</span>

            <div className="stepper">
              <button
                type="button"
                onClick={onRemove}
                disabled={!onRemove || quantity <= 0}
                aria-label={`Remove one ${card.name}`}
              >
                <Minus size={13} />
              </button>

              <b>{quantity}</b>

              <button
                type="button"
                onClick={onAdd}
                disabled={!onAdd}
                aria-label={`Add one ${card.name}`}
              >
                <Plus size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CollectionCardDialog({
  card,
  cards,
  scans,
  quantity,
  open,
  onClose,
}: {
  card: CatalogCard | null;
  cards: CatalogCard[];
  scans: Array<{
    id: number;
    frontImageUrl?: string | null;
    backImageUrl?: string | null;
    createdAt: Date | string;
    recognitionStatus: "pending" | "matched" | "review";
  }>;
  quantity: number;
  open: boolean;
  onClose: () => void;
}) {
  const [scanSide, setScanSide] = useState<"front" | "back">("front");
  const [selectedScanId, setSelectedScanId] = useState<number | null>(null);
  const [details, setDetails] = useState<CardDetails>();
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [correctionQuery, setCorrectionQuery] = useState("");
  const [correctionCardId, setCorrectionCardId] = useState<number | null>(null);
  const [isChangingVersion, setIsChangingVersion] = useState(false);
  const [versionCardId, setVersionCardId] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const correctScan = trpc.scans.correct.useMutation({
    onSuccess: () => {
      void utils.collection.list.invalidate();
      void utils.scans.list.invalidate();

      toast.success("Scanned card corrected.");
      setIsCorrecting(false);
      setCorrectionQuery("");
      setCorrectionCardId(null);
      setIsChangingVersion(false);
      setVersionCardId(null);
      onClose();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  useEffect(() => {
    if (!open || !card) {
      return;
    }

    setScanSide("front");
    setSelectedScanId(scans[0]?.id ?? null);
    setIsCorrecting(false);
    setCorrectionQuery("");
    setCorrectionCardId(null);
    setIsChangingVersion(false);
    setVersionCardId(null);

    let cancelled = false;

    void loadCardDetails().then((allDetails) => {
      if (!cancelled) {
        setDetails(allDetails[card.id]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [open, card?.id]);

  const correctionMatches = useMemo(() => {
    const query = correctionQuery.trim().toLowerCase();

    if (!query) {
      return cards.slice(0, 20);
    }

    return cards
      .filter((candidate) =>
        [
          String(candidate.id),
          candidate.name,
          candidate.subtitle ?? "",
          candidate.setName,
          candidate.rarity,
          candidate.kind,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
      .slice(0, 30);
  }, [cards, correctionQuery]);

  const versionMatches = useMemo(() => {
    if (!card) {
      return [];
    }

    return cards.filter(
      (candidate) =>
        candidate.name === card.name &&
        candidate.id !== card.id,
    );
  }, [cards, card]);

  if (!open || !card) {
    return null;
  }

  const classifications = details?.classifications ?? [];
  const keywords = details?.keywords ?? [];
  const rulesText = details?.rulesText
    ? formatRulesText(details.rulesText)
    : "";

  const selectedScan =
    scans.find((scan) => scan.id === selectedScanId) ?? scans[0];

  const correctionCard =
    cards.find((candidate) => candidate.id === correctionCardId) ?? null;

  const recognitionStatus = selectedScan?.recognitionStatus;

  const statusMeta =
    recognitionStatus === "matched"
      ? {
        label: "Matched",
        background: "rgba(34,197,94,.12)",
        border: "rgba(34,197,94,.3)",
        color: "#86efac",
      }
      : recognitionStatus === "review"
        ? {
          label: "Needs review",
          background: "rgba(250,204,21,.12)",
          border: "rgba(250,204,21,.3)",
          color: "#fde68a",
        }
        : {
          label: "Pending",
          background: "rgba(148,163,184,.12)",
          border: "rgba(148,163,184,.25)",
          color: "#cbd5e1",
        };

  const scanImage =
    scanSide === "front"
      ? selectedScan?.frontImageUrl
      : selectedScan?.backImageUrl;

  const hasFront = Boolean(selectedScan?.frontImageUrl);
  const hasBack = Boolean(selectedScan?.backImageUrl);
  const hasScans = hasFront || hasBack;

  const accent =
    COLOR_META[card.color as CardColor]?.hex ?? "#b9f36b";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${card.name} details`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "rgba(3, 5, 9, 0.82)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "min(1080px, 100%)",
          maxHeight: "calc(100vh - 40px)",
          overflowY: "auto",
          borderRadius: 18,
          border: `1px solid ${accent}55`,
          background:
            "linear-gradient(145deg, rgba(20,25,34,.98), rgba(7,10,15,.99))",
          boxShadow: "0 24px 80px rgba(0,0,0,.55)",
          padding: 20,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close card details"
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            width: 36,
            height: 36,
            display: "grid",
            placeItems: "center",
            border: "1px solid rgba(255,255,255,.12)",
            borderRadius: 9,
            background: "rgba(255,255,255,.05)",
            color: "white",
            cursor: "pointer",
            zIndex: 3,
          }}
        >
          <X size={18} />
        </button>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "minmax(260px, 360px) minmax(0, 1fr)",
            gap: 28,
            alignItems: "start",
          }}
        >
          {/* LEFT: DIGITAL CARD + CARD INFORMATION */}
          <div>
            <img
              src={getCardArtUrl(card)}
              alt={card.name}
              style={{
                display: "block",
                width: "100%",
                maxHeight: 520,
                objectFit: "contain",
                borderRadius: 12,
              }}
            />

            <div
              style={{
                marginTop: 10,
                textAlign: "center",
                fontSize: 12,
                opacity: 0.65,
              }}
            >
              Digital card reference
            </div>

            <div
              style={{
                marginTop: 22,
                paddingTop: 18,
                borderTop: "1px solid rgba(255,255,255,.08)",
              }}
            >
              <span className="eyebrow">Card details</span>

              <h3
                style={{
                  margin: "5px 0 12px",
                  fontSize: 22,
                }}
              >
                {card.name}
              </h3>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 7,
                  marginBottom: 14,
                }}
              >
                <span
                  style={{
                    padding: "4px 8px",
                    borderRadius: 6,
                    background: "rgba(255,255,255,.06)",
                    fontSize: 11,
                  }}
                >
                  {details?.cardType ?? card.kind}
                </span>

                {classifications.map((classification) => (
                  <span
                    key={classification}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 6,
                      background: `${accent}18`,
                      border: `1px solid ${accent}35`,
                      color: accent,
                      fontSize: 11,
                    }}
                  >
                    {classification}
                  </span>
                ))}
              </div>

              {keywords.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 7,
                    marginBottom: 16,
                  }}
                >
                  {keywords.map((keyword) => (
                    <span
                      key={keyword}
                      style={{
                        padding: "4px 8px",
                        borderRadius: 6,
                        background: "rgba(255,255,255,.05)",
                        border:
                          "1px solid rgba(255,255,255,.08)",
                        fontSize: 11,
                        color: "#c8d7cd",
                      }}
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              )}

              {rulesText && (
                <div
                  style={{
                    marginBottom: 16,
                    padding: "12px 13px",
                    borderRadius: 10,
                    background: "rgba(255,255,255,.035)",
                    borderLeft: `2px solid ${accent}88`,
                  }}
                >
                  {rulesText.split("\n").map((line, index) => (
                    <p
                      key={`${card.id}-detail-rule-${index}`}
                      style={{
                        margin: index === 0 ? 0 : "9px 0 0",
                        lineHeight: 1.55,
                        fontSize: 13,
                        color: "#d6e0da",
                      }}
                    >
                      {line}
                    </p>
                  ))}
                </div>
              )}

              {details?.flavorText && (
                <div
                  style={{
                    marginBottom: 16,
                    fontSize: 12,
                    lineHeight: 1.6,
                    fontStyle: "italic",
                    color: "#8e9d98",
                  }}
                >
                  {details.flavorText}
                </div>
              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  fontSize: 11,
                }}
              >
                <div
                  style={{
                    padding: "9px 10px",
                    borderRadius: 8,
                    background: "rgba(255,255,255,.035)",
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      opacity: 0.5,
                      marginBottom: 3,
                    }}
                  >
                    Rarity
                  </span>
                  <strong>{card.rarity}</strong>
                </div>

                <div
                  style={{
                    padding: "9px 10px",
                    borderRadius: 8,
                    background: "rgba(255,255,255,.035)",
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      opacity: 0.5,
                      marginBottom: 3,
                    }}
                  >
                    Set
                  </span>
                  <strong>{card.setName}</strong>
                </div>

                {card.cost !== undefined && (
                  <div
                    style={{
                      padding: "9px 10px",
                      borderRadius: 8,
                      background: "rgba(255,255,255,.035)",
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        opacity: 0.5,
                        marginBottom: 3,
                      }}
                    >
                      Cost
                    </span>
                    <strong>{card.cost} EDDIES</strong>
                  </div>
                )}

                {card.power !== undefined && (
                  <div
                    style={{
                      padding: "9px 10px",
                      borderRadius: 8,
                      background: "rgba(255,255,255,.035)",
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        opacity: 0.5,
                        marginBottom: 3,
                      }}
                    >
                      Power
                    </span>
                    <strong>{card.power} PWR</strong>
                  </div>
                )}

                {card.ram !== undefined && (
                  <div
                    style={{
                      padding: "9px 10px",
                      borderRadius: 8,
                      background: "rgba(255,255,255,.035)",
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        opacity: 0.5,
                        marginBottom: 3,
                      }}
                    >
                      RAM
                    </span>
                    <strong>{card.ram}</strong>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT: COLLECTION + PERSONAL SCANS */}
          <div>
            <span className="eyebrow">Collection card</span>

            <h2
              style={{
                margin: "4px 0 6px",
                paddingRight: 40,
              }}
            >
              {card.name}
            </h2>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginBottom: 18,
                fontSize: 12,
                opacity: 0.7,
              }}
            >
              <span>{card.rarity}</span>
              <span>•</span>
              <span>{card.setName}</span>
              <span>•</span>
              <span>×{quantity} owned</span>
            </div>

            <div
              style={{
                borderTop: "1px solid rgba(255,255,255,.08)",
                paddingTop: 18,
              }}
            >
              <span className="eyebrow">My scans</span>

              {!hasScans ? (
                <div
                  className="empty-state"
                  style={{ marginTop: 12 }}
                >
                  <ScanLine size={24} />
                  <strong>No personal scans yet.</strong>
                  <span>
                    Scan this physical card to save front and
                    back images here.
                  </span>
                </div>
              ) : (
                <>
                  {scans.length > 1 && (
                    <div style={{ marginTop: 12, marginBottom: 14 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                          marginBottom: 8,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 11,
                            textTransform: "uppercase",
                            letterSpacing: ".08em",
                            opacity: 0.5,
                          }}
                        >
                          Saved scans
                        </span>

                        <span
                          style={{
                            fontSize: 11,
                            opacity: 0.45,
                          }}
                        >
                          {scans.length} total
                        </span>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 7,
                        }}
                      >
                        {scans.map((scan, index) => {
                          const isSelected =
                            scan.id === selectedScan?.id;

                          return (
                            <button
                              key={scan.id}
                              type="button"
                              onClick={() => {
                                setSelectedScanId(scan.id);
                                setScanSide(
                                  scan.frontImageUrl
                                    ? "front"
                                    : "back",
                                );
                              }}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 7,
                                padding: "7px 10px",
                                borderRadius: 8,
                                border: isSelected
                                  ? "1px solid rgba(185,243,107,.55)"
                                  : "1px solid rgba(255,255,255,.1)",
                                background: isSelected
                                  ? "rgba(185,243,107,.09)"
                                  : "rgba(255,255,255,.035)",
                                color: isSelected
                                  ? "#eaffc9"
                                  : "#cbd5d1",
                                cursor: "pointer",
                                font: "inherit",
                                fontSize: 11,
                              }}
                            >
                              <span
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: "50%",
                                  background:
                                    scan.recognitionStatus === "matched"
                                      ? "#86efac"
                                      : scan.recognitionStatus === "review"
                                        ? "#fde68a"
                                        : "#94a3b8",
                                  flexShrink: 0,
                                }}
                              />
                              Scan {index + 1}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {selectedScan && recognitionStatus && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        marginBottom: 12,
                        padding: "9px 10px",
                        borderRadius: 8,
                        background: statusMeta.background,
                        border: `1px solid ${statusMeta.border}`,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: statusMeta.color,
                          }}
                        >
                          Scan{" "}
                          {Math.max(
                            1,
                            scans.findIndex(
                              (scan) => scan.id === selectedScan.id,
                            ) + 1,
                          )}
                        </div>

                        <div
                          style={{
                            marginTop: 2,
                            fontSize: 10,
                            opacity: 0.55,
                          }}
                        >
                          Recognition status
                        </div>
                      </div>

                      <span
                        style={{
                          padding: "4px 7px",
                          borderRadius: 999,
                          fontSize: 10,
                          fontWeight: 700,
                          color: statusMeta.color,
                          background: "rgba(0,0,0,.16)",
                        }}
                      >
                        {statusMeta.label}
                      </span>
                    </div>
                  )}

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      marginBottom: 12,
                    }}
                  >
                    {hasFront && (
                      <Button
                        variant={
                          scanSide === "front"
                            ? "default"
                            : "outline"
                        }
                        size="sm"
                        onClick={() => setScanSide("front")}
                      >
                        Front
                      </Button>
                    )}

                    {hasBack && (
                      <Button
                        variant={
                          scanSide === "back"
                            ? "default"
                            : "outline"
                        }
                        size="sm"
                        onClick={() => setScanSide("back")}
                      >
                        Back
                      </Button>
                    )}
                  </div>

                  {scanImage ? (
                    <div
                      style={{
                        borderRadius: 12,
                        overflow: "hidden",
                        border:
                          "1px solid rgba(255,255,255,.1)",
                        background: "rgba(0,0,0,.25)",
                      }}
                    >
                      <img
                        src={scanImage}
                        alt={`${card.name} personal ${scanSide} scan`}
                        style={{
                          display: "block",
                          width: "100%",
                          maxWidth: 360,
                          maxHeight: 420,
                          margin: "0 auto",
                          objectFit: "contain",
                        }}
                      />
                    </div>
                  ) : (
                    <div className="empty-state">
                      <span>
                        No {scanSide} image was saved for this
                        scan.
                      </span>
                    </div>
                  )}

                  {selectedScan && (
                    <div
                      style={{
                        marginTop: 16,
                        paddingTop: 16,
                        borderTop: "1px solid rgba(255,255,255,.08)",
                      }}
                    >
                      {!isCorrecting && !isChangingVersion ? (
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 8,
                          }}
                        >
                          {versionMatches.length > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setIsChangingVersion(true);
                                setVersionCardId(null);
                              }}
                            >
                              Change version
                            </Button>
                          )}

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setIsCorrecting(true);
                              setCorrectionQuery("");
                              setCorrectionCardId(card.id);
                            }}
                          >
                            Correct card
                          </Button>
                        </div>
                      ) : isChangingVersion ? (
                        <div
                          style={{
                            padding: 14,
                            borderRadius: 12,
                            border: "1px solid rgba(185,243,107,.25)",
                            background: "rgba(185,243,107,.035)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 12,
                              marginBottom: 10,
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <strong
                                style={{
                                  display: "block",
                                  fontSize: 13,
                                }}
                              >
                                Change card version
                              </strong>

                              <span
                                style={{
                                  display: "block",
                                  marginTop: 3,
                                  fontSize: 11,
                                  opacity: 0.55,
                                }}
                              >
                                Choose another printing of {card.name}.
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                setIsChangingVersion(false);
                                setVersionCardId(null);
                              }}
                              style={{
                                border: 0,
                                background: "transparent",
                                color: "#94a3b8",
                                cursor: "pointer",
                                font: "inherit",
                                fontSize: 12,
                              }}
                            >
                              Cancel
                            </button>
                          </div>

                          <div
                            style={{
                              marginBottom: 10,
                              padding: "9px 10px",
                              borderRadius: 8,
                              border: "1px solid rgba(255,255,255,.08)",
                              background: "rgba(255,255,255,.025)",
                            }}
                          >
                            <span
                              style={{
                                display: "block",
                                marginBottom: 4,
                                fontSize: 9,
                                textTransform: "uppercase",
                                letterSpacing: ".08em",
                                opacity: 0.45,
                              }}
                            >
                              Current version
                            </span>

                            <strong
                              style={{
                                display: "block",
                                fontSize: 11,
                                color: "#dbe5df",
                              }}
                            >
                              {card.edition === "beta" ? "Beta" : "Retail"}
                              {card.collectorNumber
                                ? ` · ${card.collectorNumber}`
                                : ` · #${card.id}`}
                            </strong>

                            <span
                              style={{
                                display: "block",
                                marginTop: 3,
                                fontSize: 10,
                                opacity: 0.55,
                              }}
                            >
                              {card.setName}
                            </span>
                          </div>

                          <div
                            style={{
                              marginBottom: 6,
                              fontSize: 9,
                              textTransform: "uppercase",
                              letterSpacing: ".08em",
                              opacity: 0.45,
                            }}
                          >
                            Choose another printing
                          </div>

                          <div
                            style={{
                              display: "grid",
                              gap: 6,
                              maxHeight: 220,
                              overflowY: "auto",
                            }}
                          >
                            {versionMatches.map((candidate) => {
                              const selected = candidate.id === versionCardId;

                              return (
                                <button
                                  key={candidate.id}
                                  type="button"
                                  onClick={() => setVersionCardId(candidate.id)}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: 12,
                                    width: "100%",
                                    padding: 8,
                                    borderRadius: 8,
                                    border: selected
                                      ? "1px solid rgba(185,243,107,.5)"
                                      : "1px solid rgba(255,255,255,.08)",
                                    background: selected
                                      ? "rgba(185,243,107,.08)"
                                      : "rgba(255,255,255,.025)",
                                    color: "#dbe5df",
                                    cursor: "pointer",
                                    textAlign: "left",
                                    font: "inherit",
                                  }}
                                >
                                  <span
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 10,
                                      minWidth: 0,
                                    }}
                                  >
                                    <img
                                      src={
                                        candidate.printingId
                                          ? `/api/card-art/${candidate.printingId}`
                                          : candidate.imageUrl
                                      }
                                      alt={`${candidate.name} ${candidate.edition === "beta"
                                        ? "Beta"
                                        : "Retail"
                                        }`}
                                      style={{
                                        width: 48,
                                        height: 66,
                                        objectFit: "cover",
                                        borderRadius: 5,
                                        display: "block",
                                        flexShrink: 0,
                                        background: "rgba(255,255,255,.05)",
                                      }}
                                    />

                                    <span style={{ minWidth: 0 }}>
                                      <strong
                                        style={{
                                          display: "block",
                                          fontSize: 12,
                                        }}
                                      >
                                        {candidate.name}
                                      </strong>

                                      <small
                                        style={{
                                          display: "block",
                                          marginTop: 3,
                                          opacity: 0.7,
                                          fontSize: 10,
                                        }}
                                      >
                                        {candidate.edition === "beta"
                                          ? "Beta"
                                          : "Retail"}
                                        {candidate.collectorNumber
                                          ? ` · ${candidate.collectorNumber}`
                                          : ` · #${candidate.id}`}
                                        {" · "}
                                        {candidate.setName}
                                      </small>
                                    </span>
                                  </span>

                                  {selected && (
                                    <span
                                      style={{
                                        fontSize: 10,
                                        fontWeight: 700,
                                        color: "#b9f36b",
                                        flexShrink: 0,
                                      }}
                                    >
                                      Selected
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>

                          <div
                            style={{
                              display: "flex",
                              justifyContent: "flex-end",
                              gap: 8,
                              marginTop: 12,
                            }}
                          >
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setIsChangingVersion(false);
                                setVersionCardId(null);
                              }}
                            >
                              Cancel
                            </Button>

                            <Button
                              size="sm"
                              disabled={
                                versionCardId === null ||
                                versionCardId === card.id ||
                                correctScan.isPending
                              }
                              onClick={() => {
                                if (!selectedScan || versionCardId === null) {
                                  return;
                                }

                                correctScan.mutate({
                                  scanId: selectedScan.id,
                                  cardId: versionCardId,
                                });
                              }}
                            >
                              {correctScan.isPending ? "Changing..." : "Change version"}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div
                          style={{
                            padding: 14,
                            borderRadius: 12,
                            border: "1px solid rgba(185,243,107,.25)",
                            background: "rgba(185,243,107,.035)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 12,
                              marginBottom: 10,
                            }}
                          >
                            <div>
                              <strong
                                style={{
                                  display: "block",
                                  fontSize: 13,
                                }}
                              >
                                Correct scanned card
                              </strong>
                              <span
                                style={{
                                  display: "block",
                                  marginTop: 3,
                                  fontSize: 11,
                                  opacity: 0.55,
                                }}
                              >
                                Choose the catalog card this scan belongs to.
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                setIsCorrecting(false);
                                setCorrectionQuery("");
                                setCorrectionCardId(null);
                              }}
                              style={{
                                border: 0,
                                background: "transparent",
                                color: "#94a3b8",
                                cursor: "pointer",
                                font: "inherit",
                                fontSize: 12,
                              }}
                            >
                              Cancel
                            </button>
                          </div>

                          <input
                            value={correctionQuery}
                            onChange={(event) =>
                              setCorrectionQuery(event.target.value)
                            }
                            placeholder="Search by card name or ID..."
                            autoFocus
                            style={{
                              width: "100%",
                              boxSizing: "border-box",
                              padding: "10px 11px",
                              borderRadius: 8,
                              border: "1px solid rgba(255,255,255,.12)",
                              background: "rgba(0,0,0,.22)",
                              color: "#e5e7eb",
                              outline: "none",
                              font: "inherit",
                              fontSize: 12,
                            }}
                          />

                          <div
                            style={{
                              display: "grid",
                              gap: 6,
                              marginTop: 10,
                              maxHeight: 220,
                              overflowY: "auto",
                            }}
                          >
                            {correctionMatches.map((candidate) => {
                              const selected =
                                candidate.id === correctionCardId;

                              return (
                                <button
                                  key={candidate.id}
                                  type="button"
                                  onClick={() =>
                                    setCorrectionCardId(candidate.id)
                                  }
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: 10,
                                    width: "100%",
                                    padding: "9px 10px",
                                    borderRadius: 8,
                                    border: selected
                                      ? "1px solid rgba(185,243,107,.5)"
                                      : "1px solid rgba(255,255,255,.08)",
                                    background: selected
                                      ? "rgba(185,243,107,.08)"
                                      : "rgba(255,255,255,.025)",
                                    color: "#dbe5df",
                                    cursor: "pointer",
                                    textAlign: "left",
                                    font: "inherit",
                                  }}
                                >
                                  <span>
                                    <strong
                                      style={{
                                        display: "block",
                                        fontSize: 12,
                                      }}
                                    >
                                      {candidate.name}
                                    </strong>
                                    <small
                                      style={{
                                        display: "block",
                                        marginTop: 2,
                                        opacity: 0.7,
                                        fontSize: 10,
                                      }}
                                    >
                                      {candidate.edition === "beta"
                                        ? "Beta"
                                        : "Retail"}
                                      {candidate.collectorNumber
                                        ? ` · ${candidate.collectorNumber}`
                                        : ` · #${candidate.id}`}
                                      {" · "}
                                      {candidate.setName}
                                    </small>
                                  </span>

                                  {selected && (
                                    <Check
                                      size={16}
                                      style={{ flexShrink: 0 }}
                                    />
                                  )}
                                </button>
                              );
                            })}
                          </div>

                          {correctionMatches.length === 0 && (
                            <div
                              style={{
                                marginTop: 10,
                                fontSize: 11,
                                opacity: 0.55,
                              }}
                            >
                              No matching cards found.
                            </div>
                          )}

                          {correctionCard && (
                            <div
                              style={{
                                marginTop: 10,
                                fontSize: 11,
                                opacity: 0.65,
                              }}
                            >
                              Selected:{" "}
                              <strong style={{ opacity: 1 }}>
                                {correctionCard.name}
                              </strong>
                              {" · "}
                              {correctionCard.edition === "beta"
                                ? "Beta"
                                : "Retail"}
                              {correctionCard.collectorNumber
                                ? ` · ${correctionCard.collectorNumber}`
                                : ""}
                            </div>
                          )}

                          <div
                            style={{
                              display: "flex",
                              justifyContent: "flex-end",
                              gap: 8,
                              marginTop: 12,
                            }}
                          >
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setIsCorrecting(false);
                                setCorrectionQuery("");
                                setCorrectionCardId(null);
                              }}
                              disabled={correctScan.isPending}
                            >
                              Cancel
                            </Button>

                            <Button
                              variant="default"
                              size="sm"
                              disabled={
                                !selectedScan ||
                                correctionCardId === null ||
                                correctScan.isPending
                              }
                              onClick={() => {
                                if (
                                  !selectedScan ||
                                  correctionCardId === null
                                ) {
                                  return;
                                }

                                correctScan.mutate({
                                  scanId: selectedScan.id,
                                  cardId: correctionCardId,
                                });
                              }}
                            >
                              {correctScan.isPending
                                ? "Saving..."
                                : "Confirm correction"}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedScan?.createdAt && (
                    <small
                      style={{
                        display: "block",
                        marginTop: 10,
                        opacity: 0.55,
                      }}
                    >
                      Scanned{" "}
                      {new Date(
                        selectedScan.createdAt,
                      ).toLocaleString()}
                    </small>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, detail, accent }: { label: string; value: string; detail: string; accent: string }) {
  return <div className="stat-card"><div className="stat-accent" style={{ background: accent }} /><span className="eyebrow">{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function CameraPanel({ cards, isAuthenticated, onAuthRequired }: { cards: CatalogCard[]; isAuthenticated: boolean; onAuthRequired: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [streaming, setStreaming] = useState(false);
  const [side, setSide] = useState<"front" | "back">("front");
  const [front, setFront] = useState<string>();
  const [back, setBack] = useState<string>();
  const [selectedId, setSelectedId] = useState(cards[0]?.id ?? 1);
  const [query, setQuery] = useState("");
  const [ocrText, setOcrText] = useState("");
  const [ocrState, setOcrState] = useState<"idle" | "reading" | "matched" | "review">("idle");
  const [ocrConfidence, setOcrConfidence] = useState<number>();
  const [ocrMode, setOcrMode] = useState<OcrMode>("balanced");
  const utils = trpc.useUtils();

  const createScan = trpc.scans.create.useMutation({
    onSuccess: () => {
      toast.success("Scan added to your collection.");
      void utils.collection.list.invalidate();
      void utils.scans.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const selected = cards.find((card) => card.id === selectedId) ?? cards[0];
  const filtered = cards.filter((card) => `${card.name} ${card.subtitle ?? ""}`.toLowerCase().includes(query.toLowerCase())).slice(0, 6);

  async function recognizeFront(dataUrl: string, mode: OcrMode = ocrMode) {
    const quality = await assessOcrImageQuality(dataUrl);

    console.log("[OCR] Image quality:", quality);

    if (!quality.usable) {
      setOcrText("");
      setOcrConfidence(undefined);
      setOcrState("review");

      toast.warning(
        `Image is too blurry for reliable OCR (sharpness ${quality.sharpness}). Hold the card steady and capture again.`,
      );

      return;
    }
    setOcrState("reading");
    setOcrText("");
    setOcrConfidence(undefined);
    try {
      const result = await recognizeCardName(dataUrl, cards, mode);
      setOcrText(result.text);
      if (result.match) {
        setSelectedId(result.match.card.id);
        setOcrConfidence(result.match.confidence);
        setOcrState("matched");
        toast.success(`OCR matched ${result.match.card.name} (${result.match.confidence}% confidence).`);
      } else {
        setOcrState("review");
        toast.info("OCR read the scan, but could not confidently match a catalog card. Please choose one below.");
      }
    } catch (error) {
      console.error("[OCR] Recognition failed:", error);

      setOcrState("review");

      const message =
        error instanceof Error
          ? error.message
          : String(error);

      toast.error(`OCR failed: ${message}`);
    }
  }

  function changeOcrMode(event: React.ChangeEvent<HTMLSelectElement>) {
    const mode = event.target.value as OcrMode;
    setOcrMode(mode);
    if (front) void recognizeFront(front, mode);
  }

  useEffect(() => () => { videoRef.current?.srcObject && (videoRef.current.srcObject as MediaStream).getTracks().forEach((track) => track.stop()); }, []);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false,
      });
      const track = stream.getVideoTracks()[0];

      const capabilities = track.getCapabilities() as MediaTrackCapabilities & {
        sharpness?: {
          min: number;
          max: number;
          step?: number;
        };
      };

      console.log("[Camera] capabilities:", capabilities);
      console.log("[Camera] settings before:", track.getSettings());

      if ("sharpness" in capabilities) {
        const sharpness = capabilities.sharpness;

        if (sharpness) {
          await track.applyConstraints({
            advanced: [
              {
                sharpness: sharpness.max,
              } as MediaTrackConstraintSet,
            ],
          });

          console.log("[Camera] applied maximum sharpness:", sharpness.max);
        }
      }

      console.log("[Camera] settings after:", track.getSettings());

      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); setStreaming(true); }
    } catch { toast.error("Camera access was blocked. You can still upload photos below."); }
  }

  function capture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || !streaming) return;

    const viewport = video.parentElement;
    if (!viewport) return;

    const sourceW = video.videoWidth;
    const sourceH = video.videoHeight;

    if (!sourceW || !sourceH) {
      toast.error("Camera is not ready yet. Try again in a moment.");
      return;
    }

    const videoRect = video.getBoundingClientRect();

    const reticle = viewport.querySelector<HTMLElement>(".reticle");

    if (!reticle) {
      toast.error("Scanner frame is unavailable.");
      return;
    }

    const reticleRect = reticle.getBoundingClientRect();

    /*
     * The <video> element itself is the reference rectangle.
     *
     * This is important on mobile browsers: the video element can
     * have a different rendered rectangle from its parent viewport.
     * The CSS uses object-fit: cover, so the camera image is scaled
     * until it completely covers the video element and the excess
     * image is cropped equally from the sides/top-bottom according
     * to object-position: center center.
     */

    const videoBoxWidth = videoRect.width;
    const videoBoxHeight = videoRect.height;

    const scale = Math.max(
      videoBoxWidth / sourceW,
      videoBoxHeight / sourceH,
    );

    const renderedW = sourceW * scale;
    const renderedH = sourceH * scale;

    /*
     * This is the actual visible camera image inside the video
     * element after object-fit: cover has been applied.
     */
    const renderedLeft =
      videoRect.left + (videoBoxWidth - renderedW) / 2;

    const renderedTop =
      videoRect.top + (videoBoxHeight - renderedH) / 2;

    /*
     * Convert the exact on-screen reticle rectangle into coordinates
     * in the original camera frame.
     */
    const sourceLeft =
      (reticleRect.left - renderedLeft) / scale;

    const sourceTop =
      (reticleRect.top - renderedTop) / scale;

    const sourceWidth =
      reticleRect.width / scale;

    const sourceHeight =
      reticleRect.height / scale;

    /*
     * Keep the crop completely inside the actual camera frame.
     */
    const sx = Math.max(
      0,
      Math.min(sourceW - sourceWidth, sourceLeft),
    );

    const sy = Math.max(
      0,
      Math.min(sourceH - sourceHeight, sourceTop),
    );

    const cropW = Math.min(
      sourceWidth,
      sourceW - sx,
    );

    const cropH = Math.min(
      sourceHeight,
      sourceH - sy,
    );

    if (cropW < 100 || cropH < 100) {
      toast.error("Scanner frame is too small. Please try again.");
      return;
    }

    /*
     * The reticle itself is the physical 64:88 card frame.
     *
     * Preserve the actual mapped crop dimensions instead of
     * forcing the result to another ratio after the crop.
     * This avoids introducing even small amounts of geometric
     * distortion before OCR.
     *
     * Cap the result at 1400px high while maintaining the exact
     * source crop aspect ratio.
     */
    const maxOutputHeight = 1400;

    const outputScale = Math.min(
      1,
      maxOutputHeight / cropH,
    );

    const outputWidth = Math.max(
      1,
      Math.round(cropW * outputScale),
    );

    const outputHeight = Math.max(
      1,
      Math.round(cropH * outputScale),
    );

    canvas.width = outputWidth;
    canvas.height = outputHeight;

    const context = canvas.getContext("2d");

    if (!context) {
      toast.error("Unable to prepare the captured image.");
      return;
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    context.drawImage(
      video,
      sx,
      sy,
      cropW,
      cropH,
      0,
      0,
      outputWidth,
      outputHeight,
    );

    const capturedDataUrl =
      canvas.toDataURL("image/jpeg", 0.92);

    if (side === "front") {
      setFront(capturedDataUrl);
      void recognizeFront(capturedDataUrl);
      setSide("back");
    } else {
      setBack(capturedDataUrl);
    }

    toast.success(
      `${side === "front" ? "Front" : "Back"} captured from the 64:88 scanner frame.`,
    );
  }

  function uploadFallback(event: React.ChangeEvent<HTMLInputElement>, target: "front" | "back") {
    const file = event.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const corrected = await rectifyDataUrl(String(reader.result));
        target === "front" ? (setFront(corrected.dataUrl), void recognizeFront(corrected.dataUrl)) : setBack(corrected.dataUrl);
        toast.success(corrected.confidence > 0.2 ? "Upload corrected with detected card corners." : "Upload imported; card edges were not clear enough to correct automatically.");
      } catch {
        toast.error("Could not process that image.");
      }
    };
    reader.readAsDataURL(file);
  }

  function saveScan() {
    if (!isAuthenticated) { onAuthRequired(); return; }
    if (!front && !back) { toast.error("Capture at least one side first."); return; }
    createScan.mutate({ cardId: selected?.id, frontDataUrl: front, backDataUrl: back, recognitionStatus: selected ? "matched" : "review" });
  }

  return <div className="scanner-grid">
    <div className="scanner-stage panel-card">
      <div className="panel-heading"><div><span className="eyebrow">Live capture</span><h2>Frame the card in the reticle</h2></div><span className={`live-dot ${streaming ? "active" : ""}`}><span />{streaming ? "camera live" : "ready"}</span></div>
      <div className="camera-viewport">
        <video ref={videoRef} muted playsInline className={streaming ? "visible" : "hidden-video"} />
        {!streaming && <div className="camera-placeholder"><Camera size={34} /><strong>Camera preview</strong><span>Use your phone camera or webcam to grab clean front + back scans.</span></div>}
        <div className="reticle"><span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" /><span className="scan-line" /></div>
        <div className="camera-hud">
          <span>64:88 CARD FRAME</span>
          <span>EDGE LOCK · ON</span>
        </div>
      </div>
      <canvas ref={canvasRef} className="hidden" />
      <div className="camera-actions"><Button variant="outline" onClick={startCamera}><Camera size={16} />{streaming ? "Restart camera" : "Enable camera"}</Button><Button onClick={capture} disabled={!streaming}><Crosshair size={16} />Capture {side}</Button></div>
      <div className="capture-strip"><CaptureThumb label="FRONT" src={front} active={side === "front"} onClick={() => setSide("front")} /><CaptureThumb label="BACK" src={back} active={side === "back"} onClick={() => setSide("back")} /></div>
    </div>
    <div className="scan-review panel-card">
      <div className="panel-heading"><div><span className="eyebrow">Recognition review</span><h2>Confirm the hit</h2></div><span className="confidence"><Sparkles size={14} /> {ocrState === "reading" ? "reading…" : ocrConfidence ? `${ocrConfidence}% OCR` : "manual review"}</span></div>
      <div className="selected-card-box">{selected ? <><img src={getCardArtUrl(selected)} alt={`${selected.name} official card reference`} style={{ width: "100%", maxHeight: 280, objectFit: "contain", borderRadius: 12, marginBottom: 12 }} /><MiniCard card={selected} /></> : <div className="empty-state">No catalog match yet.</div>}</div>
      <div className={`ocr-status ${ocrState}`}><span className="eyebrow">OCR SIGNAL</span><b>{ocrState === "reading" ? "Reading corrected front scan…" : ocrState === "matched" ? `Matched: ${selected?.name ?? "catalog card"}` : ocrText ? "Text read; confirm the catalog match" : "Capture a front side to identify automatically"}</b>{ocrText && <small>Detected text: {ocrText.slice(0, 120)}</small>}</div>
      <div className="ocr-controls"><label className="field-label" htmlFor="ocr-mode">Preprocessing mode</label><select id="ocr-mode" value={ocrMode} onChange={changeOcrMode} disabled={!front || ocrState === "reading"}>{OCR_MODES.map((mode) => <option key={mode.id} value={mode.id}>{mode.label} — {mode.detail}</option>)}</select>{front && <Button variant="outline" size="sm" onClick={() => void recognizeFront(front, ocrMode)} disabled={ocrState === "reading"}><RefreshCw size={13} />Retry OCR</Button>}</div>
      <label className="field-label">Search the official catalog</label>
      <div className="search-wrap"><Grid2X2 size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try ‘Johnny’ or ‘Ruthless’" /></div>
      <div className="match-list">{filtered.map((card) => <button key={card.id} className={`match-row ${card.id === selectedId ? "selected" : ""}`} onClick={() => setSelectedId(card.id)}><span className="match-orb" style={{ background: COLOR_META[card.color as CardColor]?.hex }} /><span><b>{card.name}</b><small>{card.subtitle ?? card.kind}</small></span>{card.id === selectedId ? <Check size={16} /> : <ChevronRight size={16} />}</button>)}</div>
      <div className="upload-row"><label className="upload-button"><Upload size={14} />Upload front<input type="file" accept="image/*" onChange={(event) => uploadFallback(event, "front")} /></label><label className="upload-button"><Upload size={14} />Upload back<input type="file" accept="image/*" onChange={(event) => uploadFallback(event, "back")} /></label></div>
      <Button className="save-scan" onClick={saveScan} disabled={createScan.isPending}><Database size={16} />{isAuthenticated ? "Add to collection" : "Sign in to save scan"}</Button>
    </div>
  </div>;
}

function CaptureThumb({ label, src, active, onClick }: { label: string; src?: string; active: boolean; onClick: () => void }) {
  return <button className={`capture-thumb ${active ? "active" : ""}`} onClick={onClick}>{src ? <img src={src} alt={`${label} capture`} /> : <div className="thumb-empty"><ScanLine size={17} /></div>}<span>{label}</span></button>;
}

function CollectionView({
  cards,
  isAuthenticated,
  onAuthRequired,
}: {
  cards: CatalogCard[];
  isAuthenticated: boolean;
  onAuthRequired: () => void;
}) {
  const { data: collection } = trpc.collection.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: scans } = trpc.scans.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const utils = trpc.useUtils();

  const upsert = trpc.collection.upsert.useMutation({
    onSuccess: () => {
      void utils.collection.list.invalidate();
      toast.success("Collection updated.");
    },
    onError: (error) => toast.error(error.message),
  });

  const importCsv = trpc.collection.importCsv.useMutation({
    onSuccess: () => {
      toast.success("Collection CSV imported.");
      void utils.collection.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const exportCsv = trpc.collection.exportCsv.useQuery(undefined, {
    enabled: false,
  });

  const quantities = useMemo(
    () =>
      Object.fromEntries(
        (collection ?? []).map((item) => [item.cardId, item.quantity]),
      ),
    [collection],
  );

  const catalogById = useMemo(
    () => new Map(cards.map((card) => [card.id, card])),
    [cards],
  );

  const scansByCardId = useMemo(() => {
    const map = new Map<
      number,
      Array<{
        id: number;
        frontImageUrl?: string | null;
        backImageUrl?: string | null;
        createdAt: Date | string;
        recognitionStatus: "pending" | "matched" | "review";
      }>
    >();

    for (const scan of scans ?? []) {
      if (scan.cardId === null) {
        continue;
      }

      const existing = map.get(scan.cardId) ?? [];

      existing.push({
        id: scan.id,
        frontImageUrl: scan.frontImageUrl,
        backImageUrl: scan.backImageUrl,
        createdAt: scan.createdAt,
        recognitionStatus: scan.recognitionStatus,
      });

      map.set(scan.cardId, existing);
    }

    return map;
  }, [scans]);

  const [selectedCollectionCardId, setSelectedCollectionCardId] =
    useState<number | null>(null);

  const selectedCollectionCard = selectedCollectionCardId
    ? catalogById.get(selectedCollectionCardId) ?? null
    : null;

  const selectedCollectionScans = selectedCollectionCardId
    ? scansByCardId.get(selectedCollectionCardId) ?? []
    : [];

  const visible = (collection ?? [])
    .filter((item) => item.quantity > 0)
    .map((item) => catalogById.get(item.cardId))
    .filter((card): card is CatalogCard => Boolean(card));

  function change(card: CatalogCard, delta: number) {
    if (!isAuthenticated) {
      onAuthRequired();
      return;
    }

    const currentQuantity = quantities[card.id] ?? 0;
    const nextQuantity = Math.max(0, currentQuantity + delta);

    upsert.mutate({
      cardId: card.id,
      quantity: nextQuantity,
      condition: "NM",
    });
  }

  async function downloadCsv() {
    if (!isAuthenticated) {
      onAuthRequired();
      return;
    }

    const result = await exportCsv.refetch();

    if (!result.data) return;

    const url = URL.createObjectURL(
      new Blob([result.data], {
        type: "text/csv;charset=utf-8",
      }),
    );

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "night-city-collection.csv";
    anchor.click();

    URL.revokeObjectURL(url);

    toast.success("Collection CSV downloaded.");
  }

  function importFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file || !isAuthenticated) {
      if (!isAuthenticated) {
        onAuthRequired();
      }
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const rows = parseCollectionCsv(String(reader.result));

      if (!rows.length) {
        toast.error("No valid collection rows found in that CSV.");
        return;
      }

      importCsv.mutate({
        items: rows,
      });
    };

    reader.readAsText(file);
    event.target.value = "";
  }

  return (
    <section className="content-section">
      <div className="section-head">
        <div>
          <span className="eyebrow">
            Inventory / official catalog collection
          </span>
          <h2>Your Night City binder</h2>
        </div>

        <div className="collection-actions">
          <label className="upload-button">
            <Upload size={14} />
            Import CSV
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={importFile}
            />
          </label>

          <Button
            variant="outline"
            onClick={() => void downloadCsv()}
            disabled={exportCsv.isFetching}
          >
            <Download size={14} />
            Export CSV
          </Button>
        </div>
      </div>

      {!isAuthenticated && (
        <div className="auth-banner">
          <ShieldCheck size={19} />
          <div>
            <b>Private collection storage</b>
            <span>
              Sign in to sync your binder and scans to the server.
            </span>
          </div>

          <Button
            size="sm"
            onClick={() => onAuthRequired()}
          >
            <LogIn size={14} />
            Sign in
          </Button>
        </div>
      )}

      {isAuthenticated && visible.length === 0 ? (
        <div className="empty-state">
          <Database size={28} />
          <strong>Your collection is empty.</strong>
          <span>
            Scan a card or add one manually to start building your binder.
          </span>
        </div>
      ) : (
        <div className="collection-grid">
          {visible.map((card) => (
            <MiniCard
              key={card.id}
              card={card}
              quantity={quantities[card.id] ?? 0}
              onOpen={() => setSelectedCollectionCardId(card.id)}
              onAdd={() => change(card, 1)}
              onRemove={() => change(card, -1)}
            />
          ))}
        </div>
      )}

      <CollectionCardDialog
        card={selectedCollectionCard}
        cards={cards}
        scans={selectedCollectionScans}
        quantity={
          selectedCollectionCard
            ? quantities[selectedCollectionCard.id] ?? 0
            : 0
        }
        open={selectedCollectionCard !== null}
        onClose={() => setSelectedCollectionCardId(null)}
      />
    </section>
  );
}

function PriceView({
  cards,
  isAuthenticated,
  onAuthRequired,
}: {
  cards: CatalogCard[];
  isAuthenticated: boolean;
  onAuthRequired: () => void;
}) {
  const { data: prices } = trpc.catalog.prices.useQuery();
  const { data: priceStatus } = trpc.catalog.priceStatus.useQuery();

  const refresh = trpc.catalog.refreshPrices.useMutation({
    onSuccess: (result) => {
      toast.success(
        `Imported ${result.cardmarket.updated} Cardmarket + ${result.cardtrader.updated} CardTrader EUR prices.`,
      );
    },
    onError: (error) => toast.error(error.message),
  });

  const cardmarketStatus = priceStatus?.providers.find(
    (provider) => provider.name === "Cardmarket",
  );

  const cardtraderStatus = priceStatus?.providers.find(
    (provider) => provider.name === "CardTrader",
  );

  type PriceRow = {
    cardId: number;
    source: string;
    currency: string;
    marketCents: number;
    lowCents: number;
    highCents: number;
  };

  const lookup = new Map<number, PriceRow[]>();

  for (const price of prices ?? []) {
    const existing = lookup.get(price.cardId) ?? [];

    existing.push({
      cardId: price.cardId,
      source: price.source,
      currency: price.currency,
      marketCents: price.marketCents,
      lowCents: price.lowCents ?? price.marketCents,
      highCents: price.highCents ?? price.marketCents,
    });

    lookup.set(price.cardId, existing);
  }

  return (
    <section className="content-section">
      <div className="section-head">
        <div>
          <span className="eyebrow">Market intelligence / EUR</span>
          <h2>Price watch</h2>
        </div>

        <Button
          variant="outline"
          onClick={() => {
            if (!isAuthenticated) {
              onAuthRequired();
              return;
            }

            refresh.mutate();
          }}
          disabled={refresh.isPending}
        >
          <RefreshCw
            size={15}
            className={refresh.isPending ? "spin" : ""}
          />
          {refresh.isPending ? "Importing prices…" : "Import daily prices"}
        </Button>
      </div>

      <div className="price-banner">
        <div className="price-signal">
          <CircleDollarSign size={21} />
          <span>Cardmarket + CardTrader · EUR</span>
        </div>

        <strong>
          {cardmarketStatus?.configured || cardtraderStatus?.configured
            ? "Live market price layers"
            : "Price providers not configured"}
        </strong>

        <p>
          {cardmarketStatus?.configured && cardtraderStatus?.configured
            ? "Prices are collected from both the Cardmarket daily guide and CardTrader marketplace, including Beta Edition data."
            : cardmarketStatus?.configured
              ? "Cardmarket daily pricing is configured. CardTrader is not currently configured."
              : cardtraderStatus?.configured
                ? "CardTrader marketplace pricing is configured. Cardmarket daily pricing is not currently configured."
                : "Configure Cardmarket and/or CardTrader on the server to enable live market pricing. Existing snapshots remain available."}
        </p>

        <div className="price-provider-links">
          <a
            href="https://www.cardmarket.com/en/Insight/Articles/Downloads"
            target="_blank"
            rel="noreferrer"
          >
            Cardmarket downloads <ExternalLink size={14} />
          </a>
        </div>
      </div>

      <div className="price-table">
        {cards.slice(0, 10).map((card) => {
          const cardPrices = lookup.get(card.id) ?? [];

          const rows: PriceRow[] = cardPrices.length
            ? cardPrices
            : [
              {
                cardId: card.id,
                source: "Catalog snapshot",
                currency: "EUR",
                marketCents: card.marketCents,
                lowCents: Math.max(1, card.marketCents - 30),
                highCents: card.marketCents + 60,
              },
            ];

          return rows.map((price, index) => (
            <div
              className="price-row"
              key={`${card.id}-${price.source}-${index}`}
            >
              <div className="price-card-name">
                <span
                  className="price-dot"
                  style={{
                    background:
                      COLOR_META[card.color as CardColor]?.hex,
                  }}
                />

                <span>
                  <b>{card.name}</b>
                  <small>{card.subtitle ?? card.kind}</small>
                </span>
              </div>

              <span>{price.source}</span>

              <strong>{money(price.marketCents)}</strong>

              <span className="price-range">
                {money(price.lowCents)} — {money(price.highCents)}
              </span>
            </div>
          ));
        })}
      </div>
    </section>
  );
}


function PrivacyControls() {
  const exportData = trpc.privacy.exportData.useQuery(undefined, { enabled: false });
  const deleteAccount = trpc.privacy.deleteAccount.useMutation({ onSuccess: () => { toast.success("Your account data was deleted."); window.location.reload(); }, onError: (error) => toast.error(error.message) });
  async function downloadData() {
    const data = await exportData.refetch();
    if (!data.data) return;
    const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "night-city-decklab-personal-data.json"; anchor.click(); URL.revokeObjectURL(url); toast.success("Personal data export downloaded.");
  }
  function eraseAccount() {
    if (window.confirm("Delete your account, collection, scans, decks, share links, and activity permanently? This cannot be undone.")) deleteAccount.mutate();
  }
  return <div className="panel-card privacy-card"><div><span className="eyebrow">Privacy / GDPR controls</span><h3>Your data stays under your control</h3><p>Export your stored profile, collection, scans, decks, share links, and activity, or permanently delete your account data. Activity telemetry is automatically limited to 90 days.</p></div><div className="privacy-actions"><Button variant="outline" onClick={() => void downloadData()} disabled={exportData.isFetching}><Download size={14} />Export personal data</Button><Button variant="outline" onClick={eraseAccount} disabled={deleteAccount.isPending}><X size={14} />Delete account data</Button></div></div>;
}
function ActivityView({ isAuthenticated, onAuthRequired }: { isAuthenticated: boolean; onAuthRequired: () => void }) {
  const { data: events, isLoading } = trpc.activity.list.useQuery(undefined, { enabled: isAuthenticated });
  if (!isAuthenticated) return <section className="content-section"><div className="auth-banner"><ShieldCheck size={19} /><div><b>Private activity timeline</b><span>Sign in to see your latest scans, deck saves, imports, and AI recommendations.</span></div><Button size="sm" onClick={() => onAuthRequired()}><LogIn size={14} />Sign in</Button></div></section>;
  return <section className="content-section"><div className="section-head"><div><span className="eyebrow">Operator log / server-synced</span><h2>Recent activity</h2></div><span className="count-pill">{events?.length ?? 0} events</span></div>{isLoading ? <div className="activity-empty"><RefreshCw className="spin" size={17} /> Loading timeline…</div> : events?.length ? <div className="activity-list">{events.map((event) => <article className="activity-row" key={event.id}><span className={`activity-icon ${event.kind}`}><ActivityIcon size={15} /></span><div><b>{event.title}</b><p>{event.detail}</p></div><time>{new Date(event.createdAt).toLocaleString()}</time></article>)}</div> : <div className="activity-empty"><ActivityIcon size={18} /><b>No activity yet</b><span>Scan a card, save a deck, or generate an AI recommendation to start your timeline.</span></div>}<PrivacyControls /></section>;
}

function DeckCardHoverPreview({
  card,
  details,
}: {
  card: CatalogCard;
  details?: CardDetails;
}) {
  const classifications = details?.classifications ?? [];
  const keywords = details?.keywords ?? [];
  const rulesText = details?.rulesText
    ? formatRulesText(details.rulesText)
    : "";

  return (
    <div
      className="deck-card-hover-preview"
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="deck-card-hover-art">
        <img
          src={getCardArtUrl(card)}
          alt={card.name}
          loading="lazy"
        />
      </div>

      <div className="deck-card-hover-content">
        <div className="deck-card-hover-top">
          <span className="eyebrow">
            {details?.cardType ?? card.kind}
          </span>

          <span className="ram-chip">
            {COLOR_META[card.color as CardColor]?.label} RAM {card.ram}
          </span>
        </div>

        <h4>{card.name}</h4>

        {classifications.length > 0 && (
          <div className="deck-card-hover-classifications">
            {classifications.map((classification) => (
              <span key={classification}>{classification}</span>
            ))}
          </div>
        )}

        {keywords.length > 0 && (
          <div className="deck-card-hover-keywords">
            {keywords.map((keyword) => (
              <span key={keyword}>{keyword}</span>
            ))}
          </div>
        )}

        {rulesText && (
          <div className="deck-card-hover-rules">
            {rulesText.split("\n").map((line, index) => (
              <p key={`${card.id}-hover-rule-${index}`}>{line}</p>
            ))}
          </div>
        )}

        {details?.flavorText && (
          <div className="deck-card-hover-flavor">
            {details.flavorText}
          </div>
        )}

        <div className="deck-card-hover-meta">
          <span>
            {card.edition === "beta" ? "Beta" : "Retail"}
          </span>

          {card.collectorNumber && (
            <span>#{card.collectorNumber}</span>
          )}

          <span>{card.rarity}</span>
        </div>
      </div>
    </div>
  );
}

function SelectedLegendSummary({
  card,
}: {
  card: CatalogCard;
}) {
  const [details, setDetails] = useState<CardDetails>();

  useEffect(() => {
    let cancelled = false;

    void loadCardDetails().then((allDetails) => {
      if (!cancelled) {
        setDetails(allDetails[card.id]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [card.id]);

  const rulesText = details?.rulesText
    ? formatRulesText(details.rulesText)
    : "";

  return (
    <article
      className="selected-legend-summary"
      style={cardTone(card.color)}
    >
      <div className="selected-legend-summary-art">
        <img
          src={getCardArtUrl(card)}
          alt={card.name}
          loading="lazy"
        />
      </div>

      <div className="selected-legend-summary-body">
        <div className="selected-legend-summary-heading">
          <div>
            <span className="eyebrow">Legend</span>
            <h4>{card.name}</h4>
          </div>

          <span className="ram-chip">
            {COLOR_META[card.color as CardColor]?.label} RAM {card.ram}
          </span>
        </div>

        {card.subtitle && (
          <p className="selected-legend-summary-subtitle">
            {card.subtitle}
          </p>
        )}

        {rulesText ? (
          <div className="selected-legend-summary-rules">
            {rulesText.split("\n").map((line, index) => (
              <p key={`${card.id}-legend-rule-${index}`}>
                {line}
              </p>
            ))}
          </div>
        ) : (
          <p className="selected-legend-summary-rules muted">
            Ability details unavailable.
          </p>
        )}

        <div className="selected-legend-summary-meta">
          <span>
            {COLOR_META[card.color as CardColor]?.label} RAM
          </span>

          <span>
            {card.edition === "beta" ? "Beta" : "Retail"}
          </span>

          {card.collectorNumber && (
            <span>#{card.collectorNumber}</span>
          )}
        </div>
      </div>
    </article>
  );
}

function DeckLab({ cards, isAuthenticated, onAuthRequired }: { cards: CatalogCard[]; isAuthenticated: boolean; onAuthRequired: () => void }) {
  const [legends, setLegends] = useState<number[]>([]);
  const [main, setMain] = useState<Record<number, number>>({});
  const [hoveredMainCardId, setHoveredMainCardId] = useState<number>();
  const [cardDetails, setCardDetails] = useState<Record<number, CardDetails>>({});
  useEffect(() => {
    let cancelled = false;

    void loadCardDetails().then((allDetails) => {
      if (!cancelled) {
        setCardDetails(allDetails);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);
  const [name, setName] = useState("Untitled Deck");
  const [deckEdition, setDeckEdition] = useState<"retail" | "beta">("retail");
  const [cardPool, setCardPool] = useState<"all" | "owned">("all");
  const { data: collection } = trpc.collection.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const [savedDeckId, setSavedDeckId] = useState<number>();
  const [shareExpiry, setShareExpiry] = useState("");
  const [shareToken, setShareToken] = useState<string>();
  const decksQuery = trpc.decks.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const [deckMode, setDeckMode] = useState<"home" | "create" | "edit">("home");
  const [builderStep, setBuilderStep] = useState<1 | 2>(1);
  const [selectedDeckId, setSelectedDeckId] = useState<number>();
  const selectedDeckCardsQuery = trpc.decks.cards.useQuery(
    { deckId: selectedDeckId! },
    {
      enabled: isAuthenticated && deckMode === "edit" && selectedDeckId !== undefined,
    },
  );
  const validation = validateDeck(legends, Object.entries(main).filter(([, quantity]) => quantity > 0).map(([cardId, quantity]) => ({ cardId: Number(cardId), quantity })));
  const saveCards = trpc.decks.saveCards.useMutation({ onSuccess: () => toast.success("Deck saved with its full card list."), onError: (error) => toast.error(error.message) });
  const createDeck = trpc.decks.create.useMutation({ onSuccess: (deck) => { setSavedDeckId(Number(deck.id)); saveCards.mutate({ deckId: Number(deck.id), legends: legends.map((cardId) => ({ cardId, quantity: 1 })), main: Object.entries(main).filter(([, quantity]) => quantity > 0).map(([cardId, quantity]) => ({ cardId: Number(cardId), quantity })) }); }, onError: (error) => toast.error(error.message) });
  const shareDeck = trpc.decks.share.useMutation({ onSuccess: (share) => { setShareToken(share.token); const url = `${window.location.origin}/share/${share.token}`; void navigator.clipboard.writeText(url); toast.success("Public deck link copied to clipboard."); }, onError: (error) => toast.error(error.message) });
  const revokeShare = trpc.decks.revokeShare.useMutation({ onSuccess: () => { setShareToken(undefined); toast.success("Public access revoked."); }, onError: (error) => toast.error(error.message) });
  const [strategyGoals, setStrategyGoals] = useState<StrategyGoal[]>(["aggro", "control", "midrange"]);
  const [weights, setWeights] = useState({ speed: 50, control: 50, budget: 50 });
  const advisor = trpc.advisor.recommendMany.useMutation({ onSuccess: (result) => { setAdvisorResults(result); toast.success(`AI found ${result.length} legal strategy options from your collection.`); }, onError: (error) => toast.error(error.message) });
  const [advisorResults, setAdvisorResults] = useState<NonNullable<ReturnType<typeof trpc.advisor.recommendMany.useMutation>["data"]>>([]);
  const ownedCardIds = new Set(
    (collection ?? [])
      .filter((item) => item.quantity > 0)
      .map((item) => item.cardId),
  );

  const poolCards =
    cardPool === "owned"
      ? cards.filter((card) => ownedCardIds.has(card.id))
      : cards;
  const editionCards = poolCards.filter(
    (card) => (card.edition ?? "retail") === deckEdition,
  );

  const legendCards = editionCards.filter(
    (card) => card.kind === "legend",
  );

  const mainCards = editionCards.filter(
    (card) => card.kind !== "legend",
  );

  const selectedLegendCards = legends
    .map((id) => cards.find((card) => card.id === id))
    .filter((card): card is CatalogCard => Boolean(card));

  const availableRam = selectedLegendCards.reduce<Record<CardColor, number>>(
    (ram, legend) => ({
      ...ram,
      [legend.color]: (ram[legend.color] ?? 0) + legend.ram,
    }),
    {} as Record<CardColor, number>,
  );

  const availableMainCards = mainCards.filter(
    (card) => card.ram <= (availableRam[card.color] ?? 0),
  );

  function updateWeight(key: keyof typeof weights, value: number) { setWeights((current) => ({ ...current, [key]: value })); }
  function applyPreset(preset: (typeof WEIGHT_PRESETS)[number]) { setStrategyGoals(preset.goals); setWeights(preset.weights); toast.success(`${preset.label} preset applied.`); }
  function toggleLegend(id: number) {
    setLegends((current) => {
      if (current.includes(id)) {
        return current.filter((item) => item !== id);
      }

      if (current.length >= 3) {
        return current;
      }

      const card = cards.find((item) => item.id === id);

      if (!card) {
        return current;
      }

      const duplicateName = current.some((selectedId) => {
        const selected = cards.find((item) => item.id === selectedId);
        return selected?.name === card.name;
      });

      if (duplicateName) {
        toast.error(`${card.name} is already selected.`);
        return current;
      }

      return [...current, id];
    });
  }
  function bump(id: number, delta: number) { setMain((current) => ({ ...current, [id]: Math.max(0, Math.min(3, (current[id] ?? 0) + delta)) })); }
  const exportText = formatDeckExport(name, legends.map((cardId) => ({ cardId, quantity: 1 })), Object.entries(main).filter(([, quantity]) => quantity > 0).map(([cardId, quantity]) => ({ cardId: Number(cardId), quantity })), cards);
  async function copyDeckExport() { await navigator.clipboard.writeText(exportText); toast.success("Deck export copied to clipboard."); }
  function downloadDeckExport() { const blob = new Blob([exportText], { type: "text/plain;charset=utf-8" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${name.trim() || "untitled-deck"}.txt`; anchor.click(); URL.revokeObjectURL(url); toast.success("Deck export downloaded."); }
  function applyRecommendation(advisorResult: NonNullable<typeof advisorResults[number]>) {
    if (!advisorResult) return;
    setLegends(advisorResult.legends.map((line) => line.cardId));
    setMain(Object.fromEntries(advisorResult.main.map((line) => [line.cardId, line.quantity])));
    setName(advisorResult.name);
    toast.success("AI recommendation loaded into the deck lab.");
  }

  useEffect(() => {
    if (
      deckMode !== "edit" ||
      selectedDeckId === undefined ||
      !selectedDeckCardsQuery.data
    ) {
      return;
    }

    const savedLegends = selectedDeckCardsQuery.data
      .filter((line) => line.slot === "legend")
      .map((line) => line.cardId);

    const savedCardIds = selectedDeckCardsQuery.data.map(
      (line) => line.cardId,
    );

    const savedCards = savedCardIds
      .map((cardId) => cards.find((card) => card.id === cardId))
      .filter((card): card is CatalogCard => Boolean(card));

    const hasBetaCards = savedCards.some(
      (card) => card.edition === "beta",
    );

    setDeckEdition(hasBetaCards ? "beta" : "retail");

    const savedMain = Object.fromEntries(
      selectedDeckCardsQuery.data
        .filter((line) => line.slot === "main")
        .map((line) => [line.cardId, line.quantity]),
    );

    setLegends(savedLegends);
    setMain(savedMain);
    setBuilderStep(2);
  }, [deckMode, selectedDeckId, selectedDeckCardsQuery.data, cards]);

  function startNewDeck() {
    setDeckMode("create");
    setBuilderStep(1);
    setSelectedDeckId(undefined);
    setSavedDeckId(undefined);
    setShareToken(undefined);
    setShareExpiry("");
    setLegends([]);
    setMain({});
    setName("Untitled Deck");
    setDeckEdition("retail");
  }

  function openSavedDeck(deck: { id: number; name: string }) {
    setDeckMode("edit");
    setBuilderStep(2);
    setSelectedDeckId(Number(deck.id));
    setSavedDeckId(Number(deck.id));
    setName(deck.name);
    setShareToken(undefined);
    setShareExpiry("");
  }

  function backToDeckList() {
    setDeckMode("home");
    setBuilderStep(1);
    setSelectedDeckId(undefined);
    setSavedDeckId(undefined);
    setShareToken(undefined);
    setShareExpiry("");
  }

  if (deckMode === "home") {
    return (
      <section className="content-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Deck lab / saved builds</span>
            <h2>Your decks</h2>
          </div>
          <Button onClick={startNewDeck}>
            <Plus size={15} />
            New deck
          </Button>
        </div>

        {!isAuthenticated ? (
          <div className="deck-home-empty">
            <Database size={24} />
            <div>
              <b>Sign in to see your saved decks</b>
              <span>
                You can still build a deck in demo mode, but saved decks are
                tied to your account.
              </span>
            </div>
            <Button size="sm" onClick={onAuthRequired}>
              <LogIn size={14} />
              Sign in
            </Button>
          </div>
        ) : decksQuery.isLoading ? (
          <div className="deck-home-empty">
            <RefreshCw className="spin" size={18} />
            <span>Loading your decks…</span>
          </div>
        ) : decksQuery.data?.length ? (
          <div className="saved-deck-grid">
            {decksQuery.data.map((deck) => (
              <button
                key={deck.id}
                type="button"
                className="saved-deck-card"
                onClick={() => openSavedDeck(deck)}
              >
                <span className="eyebrow">Saved deck</span>
                <strong>{deck.name}</strong>
                <span>
                  Updated{" "}
                  {new Date(deck.updatedAt).toLocaleDateString()}
                </span>
                <ChevronRight size={17} />
              </button>
            ))}
          </div>
        ) : (
          <div className="deck-home-empty">
            <Database size={24} />
            <div>
              <b>No decks yet</b>
              <span>Create your first deck by choosing three Legends.</span>
            </div>
            <Button size="sm" onClick={startNewDeck}>
              <Plus size={14} />
              Create first deck
            </Button>
          </div>
        )}
      </section>
    );
  }

  if (deckMode === "create" && builderStep === 1) {
    return (
      <section className="content-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Deck lab / 01 of 02</span>
            <h2>Choose your Legends</h2>
            <p className="deck-step-copy">
              Select three unique Legend names. Their color and RAM determine
              which cards can enter your main deck.
            </p>
            <div className="deck-edition-picker">
              <span className="eyebrow">Deck version</span>
              <div className="deck-edition-options">
                <button
                  type="button"
                  className={deckEdition === "retail" ? "active" : ""}
                  onClick={() => {
                    setDeckEdition("retail");
                    setLegends([]);
                    setMain({});
                  }}
                >
                  <b>Retail</b>
                  <small>Official retail cards</small>
                </button>

                <button
                  type="button"
                  className={deckEdition === "beta" ? "active" : ""}
                  onClick={() => {
                    setDeckEdition("beta");
                    setLegends([]);
                    setMain({});
                  }}
                >
                  <b>Beta</b>
                  <small>Beta card pool</small>
                </button>
              </div>

              <span className="eyebrow deck-pool-label">Card pool</span>
              <div className="deck-edition-options">
                <button
                  type="button"
                  className={cardPool === "all" ? "active" : ""}
                  onClick={() => setCardPool("all")}
                >
                  <b>All</b>
                  <small>All cards in this edition</small>
                </button>

                <button
                  type="button"
                  className={cardPool === "owned" ? "active" : ""}
                  onClick={() => setCardPool("owned")}
                >
                  <b>Owned</b>
                  <small>Cards in your collection</small>
                </button>
              </div>
            </div>
          </div>
          <div className="deck-step-actions">
            <Button variant="outline" size="sm" onClick={backToDeckList}>
              <ChevronLeft size={14} />
              Back to decks
            </Button>
            <span className="count-pill">
              {legends.length} / 3 selected
            </span>
          </div>
        </div>

        <div className="legend-builder-grid">
          {legendCards.map((card) => {
            const selected = legends.includes(card.id);
            const sameNameSelected = selectedLegendCards.some(
              (legend) => legend.name === card.name && legend.id !== card.id,
            );

            return (
              <button
                key={card.id}
                type="button"
                className={`legend-builder-card ${selected ? "selected" : ""
                  } ${sameNameSelected ? "name-conflict" : ""}`}
                style={cardTone(card.color)}
                onClick={() => toggleLegend(card.id)}
              >
                <div className="legend-builder-art">
                  <img
                    src={getCardArtUrl(card)}
                    alt={card.name}
                    loading="lazy"
                  />
                  <span className="legend-builder-selected">
                    {selected ? <Check size={14} /> : <Plus size={14} />}
                  </span>
                </div>

                <div className="legend-builder-body">
                  <div className="legend-builder-title">
                    <div>
                      <span className="eyebrow">Legend</span>
                      <h3>{card.name}</h3>
                    </div>
                    <span className="ram-chip">
                      {COLOR_META[card.color as CardColor]?.label} RAM{" "}
                      {card.ram}
                    </span>
                  </div>

                  {card.subtitle && (
                    <p className="legend-builder-subtitle">
                      {card.subtitle}
                    </p>
                  )}

                  <div className="legend-builder-meta">
                    <span>
                      <b>Color</b>
                      {COLOR_META[card.color as CardColor]?.label}
                    </span>
                    <span>
                      <b>Rarity</b>
                      {card.rarity}
                    </span>
                    <span>
                      <b>Edition</b>
                      {card.edition === "beta" ? "Beta" : "Retail"}
                    </span>
                    {card.collectorNumber && (
                      <span>
                        <b>Collector</b>
                        {card.collectorNumber}
                      </span>
                    )}
                  </div>

                  <small className="legend-builder-set">
                    {card.setName}
                  </small>

                  {sameNameSelected && !selected && (
                    <span className="legend-builder-warning">
                      Another printing of this Legend is already selected.
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="legend-builder-footer">
          <div>
            <span className="eyebrow">RAM preview</span>
            <div className="selected-legend-ram">
              {Object.entries(availableRam).length ? (
                Object.entries(availableRam).map(([color, value]) => (
                  <span key={color}>
                    {COLOR_META[color as CardColor]?.label} RAM{" "}
                    <b>{value}</b>
                  </span>
                ))
              ) : (
                <span>Select Legends to establish your RAM limits.</span>
              )}
            </div>
          </div>

          <Button
            disabled={legends.length !== 3}
            onClick={() => {
              setBuilderStep(2);
              setMain({});
            }}
          >
            Continue to main deck
            <ChevronRight size={15} />
          </Button>
        </div>
      </section>
    );
  }

  return <section className="content-section"><div className="section-head"><div><span className="eyebrow">Deck lab / RAM-aware builder</span><h2>Assemble your crew</h2></div><div className="deck-export-actions"><Button variant="outline" size="sm" onClick={() => void copyDeckExport()}><Clipboard size={14} />Copy export</Button><Button variant="outline" size="sm" onClick={downloadDeckExport}><Download size={14} />Download .txt</Button></div><div className="deck-name"><input value={name} onChange={(event) => setName(event.target.value)} /><Button size="sm" onClick={() => { if (!isAuthenticated) { onAuthRequired(); return; } if (!validation.legal) { toast.error("Fix the deck legality warnings before saving."); return; } createDeck.mutate({ name }); }}><Database size={14} />Save deck</Button>{savedDeckId && <><label className="share-expiry"><span>Link expiry</span><input type="datetime-local" value={shareExpiry} onChange={(event) => setShareExpiry(event.target.value)} /></label><Button variant="outline" size="sm" onClick={() => shareDeck.mutate({ deckId: savedDeckId, expiresAt: shareExpiry ? new Date(shareExpiry) : null })} disabled={shareDeck.isPending}><Share2 size={14} />{shareToken ? "Update link" : "Share link"}</Button>{shareToken && <Button variant="outline" size="sm" onClick={() => revokeShare.mutate({ deckId: savedDeckId })} disabled={revokeShare.isPending}><X size={14} />Revoke</Button>}</>}</div></div><div className="advisor-card"><div className="advisor-copy"><span className="eyebrow lime">AI DECK ADVISOR / COMPARE BUILDS</span><h3>{advisorResults.length ? `${advisorResults.length} strategies ready to compare` : "Find the strongest deck in your binder"}</h3><p>Choose one or more goals. Each candidate uses only owned cards and is checked against the official RAM and deck-building rules.</p><div className="preset-library"><span className="preset-label">Saved presets</span><div className="preset-list">{WEIGHT_PRESETS.map((preset) => <button key={preset.id} type="button" className="preset-button" onClick={() => applyPreset(preset)}><b>{preset.label}</b><small>{preset.detail}</small></button>)}</div></div><div className="weight-controls">{(["speed", "control", "budget"] as const).map((key) => <label key={key}><span><b>{key}</b><output>{weights[key]}</output></span><input type="range" min="0" max="100" step="5" value={weights[key]} onChange={(event) => updateWeight(key, Number(event.target.value))} /></label>)}</div><div className="strategy-picker">{STRATEGY_GOALS.map((goal) => <button key={goal.id} type="button" className={`strategy-chip ${strategyGoals.includes(goal.id) ? "selected" : ""}`} onClick={() => setStrategyGoals((current) => current.includes(goal.id) ? current.filter((item) => item !== goal.id) : current.length < 3 ? [...current, goal.id] : current)}><b>{goal.label}</b><small>{goal.detail}</small></button>)}</div><div className="advisor-actions"><Button onClick={() => { if (!isAuthenticated) { onAuthRequired(); return; } if (!strategyGoals.length) { toast.error("Choose at least one strategy goal."); return; } advisor.mutate({ goals: strategyGoals, weights }); }} disabled={advisor.isPending}><Sparkles size={15} />{advisor.isPending ? "Comparing strategies…" : `Compare ${strategyGoals.length || "selected"} builds`}</Button></div></div>{advisorResults.length > 0 && <div className="advisor-comparison">{advisorResults.map((result) => <article className="advisor-result" key={result.strategy}><div className="advisor-result-head"><span className="eyebrow">{result.strategy}</span><strong>{result.name}</strong></div><p>{result.summary}</p><div className="advisor-meta"><span>{result.totalMain} main cards</span><span>{result.legends.length} Legends</span></div><div className="advisor-reasons">{result.whyLegends.slice(0, 2).map((reason) => <span key={reason}>{reason}</span>)}</div><Button size="sm" variant="outline" onClick={() => applyRecommendation(result)}>Use this build <ChevronRight size={13} /></Button></article>)}</div>}{advisorResults.length > 1 && <div className="advisor-diff"><div className="advisor-diff-head"><div><span className="eyebrow">CARD-BY-CARD DIFF</span><h4>Where the builds diverge</h4></div><small>Shared cards stay dim; quantity changes glow.</small></div><div className="diff-table"><div className="diff-row diff-heading"><span>Card</span>{advisorResults.map((result) => <span key={result.strategy}>{result.strategy}</span>)}</div>{comparisonRows(advisorResults, cards).map((row) => <div className="diff-row" key={row.card.id}><span className="diff-card"><i style={{ background: COLOR_META[row.card.color]?.hex }} />{row.card.name}</span>{row.quantities.map((quantity, index) => <span className={`diff-cell ${quantity === 0 ? "empty" : index === 0 || quantity === row.quantities[0] ? "same" : "changed"}`} key={`${row.card.id}-${index}`}>{quantity || "—"}</span>)}</div>)}</div></div>}</div>
    <div className="deck-layout">
      <div className="deck-main">
        <div className="deck-block selected-legends-block">
          <div className="block-head">
            <div>
              <span className="eyebrow">Selected Legends</span>
              <h3>Your crew defines the RAM ceiling</h3>
            </div>

            <span className="count-pill">
              {legends.length} / 3
            </span>
          </div>

          <div className="selected-legends-grid">
            {selectedLegendCards.map((card) => (
              <SelectedLegendSummary
                key={card.id}
                card={card}
              />
            ))}
          </div>
        </div>
        <div className="deck-block">
          <div className="block-head">
            <div>
              <span className="eyebrow">02 / Main deck</span>
              <h3>Build the 40–50 card core</h3>
            </div>
            <span className={`count-pill ${validation.totalMain >= 40 && validation.totalMain <= 50 ? "good" : "warn"}`}>{validation.totalMain} / 50</span>
          </div>
          <div className="deck-card-list">
            {availableMainCards.map((card) => (
              <div
                className="deck-card-line"
                key={card.id}
                onMouseLeave={() => setHoveredMainCardId(undefined)}
              >
                <div
                  className="line-orb"
                  style={{
                    background:
                      COLOR_META[card.color as CardColor]?.hex,
                  }}
                />

                <div className="line-name">
                  <div
                    className="deck-card-name-trigger"
                    onMouseEnter={() => setHoveredMainCardId(card.id)}
                  >
                    <b>{card.name}</b>

                    {hoveredMainCardId === card.id && (
                      <DeckCardHoverPreview
                        card={card}
                        details={cardDetails[card.id]}
                      />
                    )}
                  </div>

                  <small>
                    {card.kind} ·{" "}
                    {COLOR_META[card.color as CardColor]?.label} RAM{" "}
                    {card.ram}
                  </small>
                </div>

                <span className="line-price">
                  {money(card.marketCents)}
                </span>

                <div className="stepper">
                  <button
                    type="button"
                    onClick={() => bump(card.id, -1)}
                    disabled={!main[card.id]}
                  >
                    <Minus size={13} />
                  </button>

                  <b>{main[card.id] ?? 0}</b>

                  <button
                    type="button"
                    onClick={() => bump(card.id, 1)}
                    disabled={(main[card.id] ?? 0) >= 3}
                  >
                    <Plus size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <aside className="rules-card">
        <div className="rules-top">
          <span className="eyebrow">Legality check</span>{validation.legal ? <span className="legal-badge">
            <Check size={14} />LEGAL</span> : <span className="illegal-badge"><X size={14} />IN PROGRESS</span>}
        </div>
        <div className="rules-score">
          <strong>{validation.totalMain}</strong>
          <span>main cards</span>
        </div>
        <div className="ram-bars">{Object.entries(validation.ram).filter(([, value]) => value > 0).map(([color, value]) => <div className="ram-bar" key={color}><div>
          <span style={{ color: COLOR_META[color as CardColor]?.hex }}>{COLOR_META[color as CardColor]?.label} RAM</span>
          <b>{value}</b>
        </div>
          <div className="bar-track">
            <span style={{ width: `${Math.min(100, value * 25)}%`, background: COLOR_META[color as CardColor]?.hex }} />
          </div>
        </div>
        )}
        </div>
        <div className="rules-copy"><b>RAM protocol</b>
          <p>Your three Legends set the maximum RAM value for each color. Every card must stay within its color ceiling.</p>
        </div>
        <div className="validation-list">{validation.errors.length ? validation.errors.slice(0, 5).map((error) =>
          <div key={error}>
            <X size={14} />{error}</div>) : <div className="valid-line">
          <Check size={14} />Deck meets the published build rules.</div>
        }
        </div>
        <a className="rules-link" href="https://cyberpunktcg.com/gameplay-guide#gameplay-guide-deck-building-ram" target="_blank" rel="noreferrer">Read official deck rules <ExternalLink size={14} />
        </a>
      </aside>
    </div>
  </section>;
}

function Overview({ cards, isAuthenticated, setView, onAuthRequired }: { cards: CatalogCard[]; isAuthenticated: boolean; setView: (view: View) => void; onAuthRequired: () => void }) {
  const tracked = isAuthenticated ? "Syncing" : "Demo mode";
  return <section className="content-section overview"><div className="hero-copy"><div><span className="eyebrow lime">NIGHT CITY / COLLECTION OS</span><h1>Turn your binder<br /><em>into a deck.</em></h1><p>Scan both sides. Keep every hit on the server. Build within RAM before you sit down at the table.</p><div className="hero-actions"><Button onClick={() => setView("scanner")}><ScanLine size={17} />Scan a card</Button><Button variant="outline" onClick={() => setView("decks")}><Zap size={17} />Open deck lab</Button>{!isAuthenticated && <Button variant="outline" onClick={() => onAuthRequired()}><LogIn size={17} />Sign in to save your binder</Button>}</div></div><div className="hero-orbit"><div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><div className="orbit-card"><span>RAM</span><strong>02</strong><small>GREEN</small></div><div className="orbit-tag tag-one">EDGE LOCK</div><div className="orbit-tag tag-two">SYNCED</div></div></div><div className="stats-grid"><StatCard label="Cards tracked" value={String(cards.length)} detail="official catalog ready" accent="#b9f36b" /><StatCard label="Collection value" value="€33.30" detail="EUR snapshot estimate" accent="#72d4ff" /><StatCard label="Decks in lab" value="02" detail="one needs RAM review" accent="#ff6b7f" /><StatCard label="Sync status" value={tracked} detail={isAuthenticated ? "server connected" : "sign in to persist"} accent="#c39bff" /></div><div className="overview-grid"><div className="panel-card feature-card"><div className="panel-heading"><div><span className="eyebrow">Fast lane</span><h2>Scan → match → store</h2></div><span className="step-index">01—03</span></div><div className="flow-steps"><FlowStep number="01" icon={<Camera size={18} />} title="Capture both sides" detail="Assisted crop keeps the card frame clean." /><FlowStep number="02" icon={<Crosshair size={18} />} title="Confirm recognition" detail="Search the official catalog if needed." /><FlowStep number="03" icon={<Database size={18} />} title="Persist the hit" detail="Images and quantity stay attached to your account." /></div><Button variant="outline" className="full-button" onClick={() => setView("scanner")}>Start a capture <ChevronRight size={15} /></Button></div><div className="panel-card pulse-card"><div className="panel-heading"><div><span className="eyebrow">Rule pulse</span><h2>Deck legality at a glance</h2></div><ShieldCheck size={19} className="lime-icon" /></div><div className="rule-pulse"><div><strong>3</strong><span>unique Legends</span></div><div><strong>40–50</strong><span>main cards</span></div><div><strong>≤ 3</strong><span>copies per card</span></div></div><p>RAM is color-specific: your Legends define the ceiling for every card you add.</p><Button variant="outline" className="full-button" onClick={() => setView("decks")}>Check a deck <ChevronRight size={15} /></Button></div></div><div className="recent-row"><div><span className="eyebrow">Catalog signal</span><h2>Cards ready to explore</h2></div><div className="recent-cards">{cards.slice(0, 4).map((card) => <MiniCard key={card.id} card={card} />)}</div></div></section>;
}

function FlowStep({ number, icon, title, detail }: { number: string; icon: React.ReactNode; title: string; detail: string }) { return <div className="flow-step"><span className="flow-number">{number}</span><span className="flow-icon">{icon}</span><div><b>{title}</b><small>{detail}</small></div></div>; }

export default function Home() {
  const { user, isAuthenticated, logout } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);

  function openAuth() {
    setAuthOpen(true);
  }

  const [view, setView] = useState<View>("overview");
  const { data: catalog } = trpc.catalog.list.useQuery();
  const cards = (catalog?.length ? catalog : CATALOG_CARDS) as CatalogCard[];
  return (
    <>
      <div className="app-shell"><aside className="side-rail"><div className="brand-mark"><div className="brand-glyph">N</div><div><b>NIGHT CITY</b><span>DECKLAB</span></div></div><div className="rail-label">WORKSPACE</div><nav>{nav.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><item.icon size={17} /><span>{item.label}</span>{item.id === "scanner" && <i />}</button>)}</nav><div className="rail-bottom"><div className="sync-card"><span className="sync-orb"><span /></span><div><b>{isAuthenticated ? user?.name ?? "Operator" : "Guest operator"}</b><small>{isAuthenticated ? "server sync active" : "demo data only"}</small></div></div>{isAuthenticated ? <button className="logout-link" onClick={() => logout()}>Sign out <ExternalLink size={13} /></button> : <Button variant="outline" className="rail-login" onClick={() => openAuth()}><LogIn size={14} />Sign in to sync</Button>}</div></aside><main className="main-canvas"><header className="topbar"><div><span className="topbar-kicker">WELCOME TO NIGHT CITY</span><span className="topbar-divider">/</span><span className="topbar-current">{nav.find((item) => item.id === view)?.label}</span></div><div className="topbar-right"><span className="status-chip"><span />API layer ready</span>{isAuthenticated ? <span className="account-chip">{user?.name ?? "Signed in"}</span> : <Button variant="outline" size="sm" className="topbar-login" onClick={() => openAuth()}><LogIn size={13} />Sign in to sync</Button>}<span className="version-chip">v0.1 / private beta</span></div></header><div className="page-content">{view === "overview" && <Overview cards={cards} isAuthenticated={isAuthenticated} setView={setView} onAuthRequired={openAuth} />}{view === "scanner" && <><div className="page-intro"><div><span className="eyebrow lime">CARD SCANNER / FRONT + BACK</span><h1>Capture a clean hit.</h1><p>Use your phone camera or webcam. We keep both sides together, then add the match to your server-side binder.</p></div><div className="intro-stat"><span>SUPPORTED</span><strong>WEB + MOBILE</strong><small>camera permissions stay in your browser</small></div></div><CameraPanel cards={cards} isAuthenticated={isAuthenticated} onAuthRequired={openAuth} /></>}{view === "collection" && <><div className="page-intro"><div><span className="eyebrow lime">MY COLLECTION / SERVER-SYNCED</span><h1>Your binder, indexed.</h1><p>Every scan becomes a useful inventory line with quantity, condition, image pair, and market context.</p></div><div className="intro-stat"><span>EST. VALUE</span><strong>€0.00</strong><small>based on latest EUR snapshot</small></div></div><CollectionView cards={cards} isAuthenticated={isAuthenticated} onAuthRequired={openAuth} /></>}{view === "decks" && <><div className="page-intro"><div><span className="eyebrow lime">DECK LAB / RAM VALIDATOR</span><h1>Build legal. Play louder.</h1><p>Choose Legends first. The RAM rail will tell you exactly why a card fits—or why it does not.</p></div><div className="intro-stat"><span>RULE SOURCE</span><strong>OFFICIAL</strong><small>Cyberpunk TCG gameplay guide</small></div></div><DeckLab cards={cards} isAuthenticated={isAuthenticated} onAuthRequired={openAuth} /></>}{view === "prices" && <><div className="page-intro"><div><span className="eyebrow lime">PRICE WATCH / MARKET DATA</span><h1>Know what is in the stack.</h1><p>See market snapshots beside the cards you own, with Cardmarket daily EUR data when configured.</p></div><div className="intro-stat"><span>REFRESH</span><strong>DAILY EUR</strong><small>Cardmarket price guide</small></div></div><PriceView cards={cards} isAuthenticated={isAuthenticated} onAuthRequired={openAuth} /></>}{view === "activity" && <><div className="page-intro"><div><span className="eyebrow lime">ACTIVITY / OPERATOR LOG</span><h1>See what changed.</h1><p>Track the latest scans, collection imports, deck saves, and AI recommendations tied to your account.</p></div><div className="intro-stat"><span>RETENTION</span><strong>30 EVENTS</strong><small>latest server activity</small></div></div><ActivityView isAuthenticated={isAuthenticated} onAuthRequired={openAuth} /></>}</div></main></div>
      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
    </>
  );
}