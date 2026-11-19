// 更換網站密碼：用舊密碼解開 data/ 下所有 .enc，換新 salt，再用新密碼重新加密
//   SITE_PASSWORD=<舊密碼> NEW_PASSWORD=<新密碼> node tools/rekey.mjs
// 會先全部解密驗證成功才寫入；任何一個檔解不開就整批不動。
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const oldPw = process.env.SITE_PASSWORD, newPw = process.env.NEW_PASSWORD;
if (!oldPw || !newPw) throw new Error("需要 SITE_PASSWORD（舊）與 NEW_PASSWORD（新）");

const saltPath = path.join(DATA, "salt.json");
const old = JSON.parse(fs.readFileSync(saltPath, "utf8"));
const oldKey = crypto.pbkdf2Sync(oldPw, Buffer.from(old.salt, "base64"), old.iter, 32, "sha256");
const iter = old.iter ?? 200000;
const newSalt = crypto.randomBytes(16);
const newKey = crypto.pbkdf2Sync(newPw, newSalt, iter, 32, "sha256");

function dec(b64, key) {
  const buf = Buffer.from(b64.trim(), "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(buf.length - 16));
  return Buffer.concat([d.update(buf.subarray(12, buf.length - 16)), d.final()]);
}
function enc(plain, key) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, ct, c.getAuthTag()]).toString("base64");
}
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".enc") ? [path.join(d, e.name)] : []));

const files = walk(DATA);
const plains = files.map((f) => {
  try { return dec(fs.readFileSync(f, "utf8"), oldKey); }
  catch { throw new Error(`舊密碼解不開：${path.relative(ROOT, f)}（未做任何修改）`); }
});
files.forEach((f, i) => fs.writeFileSync(f, enc(plains[i], newKey) + "\n"));
fs.writeFileSync(saltPath, JSON.stringify({ salt: newSalt.toString("base64"), iter }, null, 1) + "\n");
// 驗證
files.forEach((f, i) => { if (!dec(fs.readFileSync(f, "utf8"), newKey).equals(plains[i])) throw new Error("驗證失敗 " + f); });
console.log(`已用新密碼重新加密 ${files.length} 個檔案，並更換 salt`);
