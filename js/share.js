// Level Devil clone — share codes. Level JSON -> deflate -> base64url, prefixed "LD1.".
// Codes are self-contained: paste into the title screen box or open index.html#lvl=CODE
window.LDS = (() => {
  "use strict";

  const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const unb64url = (str) => {
    const b = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(b, (c) => c.charCodeAt(0));
  };

  async function pump(stream) {
    const reader = stream.getReader();
    const chunks = [];
    let len = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); len += value.length;
    }
    const out = new Uint8Array(len);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }

  async function encode(levelObj) {
    const json = JSON.stringify(levelObj);
    const cs = new CompressionStream("deflate-raw");
    const compressed = await pump(new Blob([json]).stream().pipeThrough(cs));
    return "LD1." + b64url(compressed);
  }

  async function decode(code) {
    code = decodeURIComponent(code.trim());
    if (!code.startsWith("LD1.")) throw new Error("not a Level Devil code");
    const bytes = unb64url(code.slice(4));
    const ds = new DecompressionStream("deflate-raw");
    const raw = await pump(new Blob([bytes]).stream().pipeThrough(ds));
    const lvl = JSON.parse(new TextDecoder().decode(raw));
    if (!lvl.spawn || !lvl.door) throw new Error("level missing spawn/door");
    return lvl;
  }

  // stable string hash (djb2) — used for the editor's verified-run handshake
  function hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  return { encode, decode, hash };
})();
