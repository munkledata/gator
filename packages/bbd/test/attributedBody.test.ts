import { test } from "node:test";
import assert from "node:assert/strict";
import { attributedBodyText } from "../src/data/imessage/attributedBody";

// A real chat.db `attributedBody` typedstream blob from an EDITED iMessage (the `text` column was
// empty). The edited body — with a multi-byte "ë" — lives only in here.
const EDITED_BLOB = Buffer.from(
    "040B73747265616D747970656481E803840140848484124E5341747472696275746564537472696E67008484084E534F626A656374008592848484084E53537472696E67019484012B2349207468696E6B205A6FC3AB207265616C6C792077616E747320746F2073656520697486840269490122928484840C4E5344696374696F6E61727900948401690292849696265F5F6B494D4261736557726974696E67446972656374696F6E4174747269627574654E616D658692848484084E534E756D626572008484074E5356616C7565009484012A848401719DFF86928496961D5F5F6B494D4D657373616765506172744174747269627574654E616D658692849B9C9D9D00868686",
    "hex"
);

test("attributedBodyText recovers the edited text (incl. multi-byte chars)", () => {
    assert.equal(attributedBodyText(EDITED_BLOB), "I think Zoë really wants to see it");
});

test("attributedBodyText is total: null on junk/empty input", () => {
    assert.equal(attributedBodyText(null), null);
    assert.equal(attributedBodyText(undefined), null);
    assert.equal(attributedBodyText(Buffer.from("not a typedstream", "utf8")), null);
    assert.equal(attributedBodyText("a string, not a buffer" as unknown), null);
});
