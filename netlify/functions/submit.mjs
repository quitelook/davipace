import multiparty from "multiparty";
import { Buffer } from "buffer";
import https from "https";
import FormData from "form-data";
import fs from "fs";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed",
    };
  }

  const buffer = Buffer.from(
    event.body,
    event.isBase64Encoded ? "base64" : "utf8"
  );

  const headers = {
    "content-type":
      event.headers["content-type"] || event.headers["Content-Type"],
  };

  return new Promise((resolve, reject) => {
    const form = new multiparty.Form();

    // Override `req` with simulated stream
    form.parse(
      {
        headers,
        on: () => {}, // dummy, never used
        pipe: (dest) => dest.end(buffer),
      },
      async (err, fields, files) => {
        if (err) {
          console.error("❌ Parse error:", err);
          return reject({
            statusCode: 400,
            body: JSON.stringify({ error: "Invalid form submission" }),
          });
        }

        const name = fields.name?.[0] || "";
        const phone = fields.phone?.[0] || "";
        const email = fields.email?.[0] || "";
        const role = fields.role?.[0] || "";

        const message = `📥 *New Application Received*\n\n👤 *Name*: ${name}\n📞 *Phone*: ${phone}\n📧 *Email*: ${email}\n💼 *Role*: ${role}`;
        try {
          await sendTelegramMessage(message);

          for (const key of ["resume", "id_front", "id_back"]) {
            const file = files[key]?.[0];
            if (file) {
              const fileBuffer = fs.readFileSync(file.path);
              await sendTelegramFile({
                buffer: fileBuffer,
                filename: file.originalFilename,
                mimetype: file.headers["content-type"],
              });
            }
          }

          resolve({
            statusCode: 200,
            body: JSON.stringify({ success: true }),
          });
        } catch (e) {
          console.error("❌ Telegram error:", e);
          reject({
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to send application" }),
          });
        }
      }
    );
  });
};

function sendTelegramMessage(text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage?chat_id=${CHAT_ID}&text=${encodeURIComponent(
    text
  )}&parse_mode=Markdown`;

  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        res.on("data", () => {});
        res.on("end", resolve);
      })
      .on("error", reject);
  });
}

function sendTelegramFile({ buffer, filename, mimetype }) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("chat_id", CHAT_ID);
    form.append("document", buffer, {
      filename,
      contentType: mimetype,
      knownLength: buffer.length,
    });

    const request = https.request(
      {
        hostname: "api.telegram.org",
        path: `/bot${BOT_TOKEN}/sendDocument`,
        method: "POST",
        headers: form.getHeaders(),
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (json.ok) return resolve();
            reject(new Error("Telegram API error: " + data));
          } catch {
            reject(new Error("Invalid Telegram response"));
          }
        });
      }
    );

    request.on("error", reject);
    form.pipe(request);
  });
}
