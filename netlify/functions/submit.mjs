import Busboy from "busboy";
import https from "https";
import { Buffer } from "buffer";
import FormData from "form-data";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed",
    };
  }

  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: event.headers });
    const formData = {};
    const files = [];

    busboy.on("field", (fieldname, value) => {
      formData[fieldname] = value;
    });

    busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
      const buffers = [];
      file.on("data", (data) => buffers.push(data));
      file.on("end", () => {
        if (filename) {
          const buffer = Buffer.concat(buffers);
          console.log("✅ File received:", filename, "Size:", buffer.length);

          files.push({
            fieldname,
            filename,
            mimetype,
            buffer,
          });
        } else {
          console.warn("⚠️ Skipping unnamed file input");
        }
      });
    });

    busboy.on("finish", async () => {
      const { name, phone, email, role } = formData;

      const message = `📥 *New Application Received*\n\n👤 *Name*: ${name}\n📞 *Phone*: ${phone}\n📧 *Email*: ${email}\n💼 *Role*: ${role}`;

      try {
        await sendTelegramMessage(message);

        for (const file of files) {
          await sendTelegramFile(file);
        }

        resolve({
          statusCode: 200,
          body: JSON.stringify({ success: true }),
        });
      } catch (err) {
        console.error("❌ Error sending to Telegram:", err);
        reject({
          statusCode: 500,
          body: JSON.stringify({ error: "Failed to send application." }),
        });
      }
    });

    const buffer = event.isBase64Encoded
      ? Buffer.from(event.body, "base64")
      : Buffer.from(event.body, "utf8");

    console.log("🔍 Parsing incoming request...");
    busboy.end(buffer);
  });
};

// Send plain Telegram message
function sendTelegramMessage(text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage?chat_id=${CHAT_ID}&text=${encodeURIComponent(
    text
  )}&parse_mode=Markdown`;

  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        res.on("data", () => {}); // No-op
        res.on("end", resolve);
      })
      .on("error", reject);
  });
}

// Send file to Telegram
function sendTelegramFile(file) {
  return new Promise((resolve, reject) => {
    const { filename, mimetype, buffer } = file;

    // ✅ Strict validation
    if (
      typeof filename !== "string" ||
      !filename ||
      !(buffer instanceof Buffer)
    ) {
      console.warn("⚠️ Invalid file skipped:", file);
      return resolve(); // Skip this file
    }

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
          console.log("📨 Telegram file upload response:", data);
          try {
            const json = JSON.parse(data);
            if (json.ok) {
              return resolve();
            } else {
              return reject(new Error("Telegram error: " + data));
            }
          } catch (err) {
            return reject(
              new Error("Failed to parse Telegram response: " + data)
            );
          }
        });
      }
    );

    request.on("error", reject);
    form.pipe(request);
  });
}
