#!/usr/bin/env node
// Dump all cookies (incl. HttpOnly) for sso.agc.gov.sg as a Netscape cookie jar
import { connect } from "./cdp.js";

const c = await connect();
const pages = await c.getPages();
const sessionId = await c.attachToPage(pages[0].targetId);
const { cookies } = await c.send(
  "Network.getCookies",
  { urls: ["https://sso.agc.gov.sg"] },
  sessionId
);
const lines = ["# Netscape HTTP Cookie File"];
for (const k of cookies) {
  const domain = k.domain.startsWith(".") ? k.domain : "." + k.domain;
  lines.push([
    domain,
    k.domain.startsWith(".") ? "TRUE" : "FALSE",
    k.path,
    k.secure ? "TRUE" : "FALSE",
    Math.floor((k.expires || 9e9) / 1000),
    k.name,
    k.value,
  ].join("\t"));
}
console.log(lines.join("\n"));
