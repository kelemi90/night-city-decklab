import { describe, expect, it } from "vitest";
import { parseCollectionCsv } from "./collectionCsv";

describe("parseCollectionCsv", () => {
  it("parses valid collection rows and preserves condition", () => {
    expect(parseCollectionCsv('cardId,cardName,quantity,condition\n"12","Johnny Silverhand",3,"LP"\n"18","Royce",1,"NM"')).toEqual([
      { cardId: 12, quantity: 3, condition: "LP" },
      { cardId: 18, quantity: 1, condition: "NM" },
    ]);
  });

  it("ignores malformed or out-of-range rows", () => {
    expect(parseCollectionCsv("cardId,cardName,quantity,condition\nabc,Unknown,2,NM\n1,Too many,100,NM\n2,Valid,0,NM")).toEqual([{ cardId: 2, quantity: 0, condition: "NM" }]);
  });
});
