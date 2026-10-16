import assert from "node:assert/strict";
import net from "node:net";
import test from "node:test";
import { addressOf, buildMime, sendViaSmtp } from "./smtp.server.ts";

test("addressOf extrae la dirección y rechaza basura", () => {
  assert.equal(addressOf("SOTYGEO <no-reply@x.com>"), "no-reply@x.com");
  assert.equal(addressOf("a@b.com"), "a@b.com");
  assert.throws(() => addressOf("no es un correo"));
});

test("buildMime codifica asunto UTF-8 y evita inyección de cabeceras", () => {
  const mime = buildMime({
    from: "SOTYGEO <no-reply@x.com>",
    to: "dest@y.com",
    subject: "Confirma tu correo — SOTYGEO\r\nBcc: evil@z.com",
    html: "<p>hola</p>",
    text: "hola",
  });
  assert.match(mime, /^Subject: =\?UTF-8\?B\?/m);
  assert.doesNotMatch(mime, /^Bcc:/m);
  assert.match(mime, /multipart\/alternative/);
});

test("sendViaSmtp entrega a un servidor SMTP local (sin auth)", async () => {
  const got: string[] = [];
  let data = "";
  const server = net.createServer((sock) => {
    let inData = false;
    sock.write("220 test ESMTP\r\n");
    sock.on("data", (chunk) => {
      const text = chunk.toString();
      if (inData) {
        data += text;
        if (data.endsWith("\r\n.\r\n")) {
          inData = false;
          sock.write("250 queued\r\n");
        }
        return;
      }
      for (const line of text.split("\r\n").filter(Boolean)) {
        got.push(line);
        if (line.startsWith("EHLO")) sock.write("250-test\r\n250 8BITMIME\r\n");
        else if (line.startsWith("MAIL FROM")) sock.write("250 ok\r\n");
        else if (line.startsWith("RCPT TO")) sock.write("250 ok\r\n");
        else if (line === "DATA") {
          inData = true;
          sock.write("354 go\r\n");
        } else if (line === "QUIT") sock.end("221 bye\r\n");
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as net.AddressInfo).port;
  try {
    const out = await sendViaSmtp(
      { host: "127.0.0.1", port, secure: false },
      { from: "SOTYGEO <no-reply@x.com>", to: "dest@y.com", subject: "Prueba", html: "<p>.hola</p>", text: ".hola" },
    );
    assert.ok(out.messageId);
    assert.ok(got.includes("MAIL FROM:<no-reply@x.com>"));
    assert.ok(got.includes("RCPT TO:<dest@y.com>"));
    assert.match(data, /Subject: Prueba/);
  } finally {
    server.close();
  }
});

test("rechaza enviar credenciales sin STARTTLS a un host remoto", async () => {
  const server = net.createServer((sock) => {
    sock.write("220 x\r\n");
    sock.on("data", () => sock.write("250 x\r\n"));
  });
  await new Promise<void>((r) => server.listen(0, "0.0.0.0", r));
  const port = (server.address() as net.AddressInfo).port;
  try {
    // "localhost" cuenta como loopback, así que simulamos un host remoto con un alias que resuelve local.
    await assert.rejects(
      sendViaSmtp(
        { host: "127.0.0.2", port, secure: false, user: "u", pass: "p", timeoutMs: 2000 },
        { from: "a@x.com", to: "b@y.com", subject: "s", html: "h", text: "t" },
      ),
      /STARTTLS|SMTP|conexi/,
    );
  } finally {
    server.close();
  }
});
