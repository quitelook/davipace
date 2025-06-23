import { IncomingForm } from "formidable";
import { Buffer } from "buffer";
import https from "https";
import fs from "fs";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Disable formidable's default file writing
export const config = {
  api: {
    bodyParser: false,
  },
};

export const handler = async (event, context) => {
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

  const form = new IncomingForm({
    multiples: true,
    keepExtensions: true,
  });

  return new Promise((resolve, reject) => {
    form.parse(
      { headers: event.headers, buffer },
      async (err, fields, files) => {
        if (err) {
          console.error("❌ Error parsing form:", err);
          return reject({
            statusCode: 400,
            body: JSON.stringify({ error: "Invalid form data" }),
          });
        }

        const { name, phone, email, role } = fields;
        const message = `📥 *New Application Received*\n\n👤 *Name*: ${name}\n📞 *Phone*: ${phone}\n📧 *Email*: ${email}\n💼 *Role*: ${role}`;

        try {
          await sendTelegramMessage(message);

          // Send files (if any)
          const fileFields = ["resume", "id_front", "id_back"];
          for (const field of fileFields) {
            const file = files[field];
            if (!file) continue;

            const buffer = fs.readFileSync(file.filepath);
            await sendTelegramFile({
              buffer,
              filename: file.originalFilename,
              mimetype: file.mimetype,
            });
          }

          resolve({
            statusCode: 200,
            body: JSON.stringify({ success: true }),
          });
        } catch (err) {
          console.error("❌ Telegram send error:", err);
          reject({
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to send application." }),
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
        res.on("data", () => {}); // no-op
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
