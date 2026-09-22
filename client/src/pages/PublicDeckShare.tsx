import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { CATALOG_CARDS, COLOR_META, type CardColor, type CatalogCard } from "@shared/deckRules";
import { Clipboard, ExternalLink, Loader2, Share2 } from "lucide-react";
import { Link, useParams } from "wouter";
import { toast } from "sonner";

const groups: Array<{ slot: "legend" | "main"; kind: CatalogCard["kind"]; label: string }> = [
  { slot: "legend", kind: "legend", label: "Legends" },
  { slot: "main", kind: "unit", label: "Units" },
  { slot: "main", kind: "gear", label: "Gears" },
  { slot: "main", kind: "program", label: "Programs" },
];

export default function PublicDeckShare() {
  const { token = "" } = useParams<{ token: string }>();
  const { data, isLoading } = trpc.publicDeck.get.useQuery({ token }, { enabled: token.length > 0 });
  if (isLoading) return <div className="share-page"><Loader2 className="spin" size={25} /><span>Loading shared build…</span></div>;
  if (!data) return <div className="share-page"><div className="share-empty"><span className="eyebrow">SHARE LINK / NOT FOUND</span><h1>This build is offline.</h1><p>The link may have expired or the deck is no longer available.</p><Link href="/"><Button>Open Night City DeckLab</Button></Link></div></div>;
  const cardRows = data.cards as Array<{ cardId: number; quantity: number; slot: "legend" | "main"; card?: CatalogCard }>;
  const shareUrl = typeof window === "undefined" ? "" : window.location.href;
  async function copyLink() { try { await navigator.clipboard.writeText(shareUrl); toast.success("Public deck link copied."); } catch { toast.error("Clipboard access was blocked. Copy the link from your address bar."); } }
  return <div className="share-page"><header className="share-header"><Link href="/"><span className="brand-mark compact"><span className="brand-glyph">N</span><span><b>NIGHT CITY</b><small>DECKLAB</small></span></span></Link><div className="share-header-actions"><span className="status-chip"><span />Public deck share</span><Button variant="outline" size="sm" onClick={() => void copyLink()}><Clipboard size={14} />Copy link</Button></div></header><main className="share-main"><div className="share-kicker"><Share2 size={15} /> SHARED BUILD / READ ONLY</div><h1>{data.deck.name}</h1><p className="share-subtitle">A Cyberpunk TCG deck shared from Night City DeckLab.{data.share.expiresAt && ` Available until ${new Date(data.share.expiresAt).toLocaleString()}.`}</p><div className="share-grid">{groups.map((group) => { const lines = cardRows.filter((line) => line.slot === group.slot && line.card?.kind === group.kind); if (!lines.length) return null; const total = lines.reduce((sum, line) => sum + line.quantity, 0); return <section className="share-block" key={group.label}><div className="share-block-head"><span className="eyebrow">{group.label}</span><b>{total} cards</b></div>{lines.map((line) => { const card = line.card ?? CATALOG_CARDS.find((item) => item.id === line.cardId); if (!card) return null; return <div className="share-line" key={`${group.label}-${line.cardId}`}><i style={{ background: COLOR_META[card.color as CardColor]?.hex }} /><span><strong>{line.quantity} {card.name}</strong><small>{card.subtitle ?? card.kind}</small></span></div>; })}</section>; })}</div><div className="share-footer"><Button variant="outline" onClick={() => void copyLink()}><Clipboard size={14} />Copy share link</Button><Link href="/"><Button variant="outline">Build your own deck <ExternalLink size={14} /></Button></Link></div></main></div>;
}
