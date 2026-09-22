# Official Cyberpunk TCG catalog import notes

Source: https://cyberpunktcg.com/cards

The official card database renders 151 cards across 3 pages, showing 60 cards on page 1. Each card tile exposes a detail route such as `/cards/v-streetkid?printing=<printing-id>` and an image URL hosted on `https://dstcynss47vun.cloudfront.net/.../render-<id>.webp?...`. Visible metadata includes card name, subtitle, kind (`LEGEND`, `UNIT`, `GEAR`, `PROGRAM`), COST, PWR, and RAM. The browser-rendered page exposes pagination buttons for pages 1, 2, 3, and Next.

The current site’s seeded catalog has only 16 records. The importer should use the official card detail pages as the canonical metadata source and store stable local copies of the images in Manus storage rather than persisting expiring signed CloudFront URLs.

The current browser HTML snapshot is at `/home/ubuntu/browser_html/cyberpunktcg_com_cards_1789681146242.html`.
