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
        console.log("File received:", filename);
        files.push({
          fieldname,
          filename,
          mimetype,
          buffer: Buffer.concat(buffers),
        });
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
        console.error("Error sending to Telegram:", err);
        reject({
          statusCode: 500,
          body: JSON.stringify({ error: "Failed to send application." }),
        });
      }
    });

    // Correct body decoding for base64 uploads from Netlify
    const buffer = event.isBase64Encoded
      ? Buffer.from(event.body, "base64")
      : Buffer.from(event.body, "utf8");

    console.log("Parsing incoming request...");
    busboy.end(buffer);
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

function sendTelegramFile(file) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("chat_id", CHAT_ID);
    form.append("document", file.buffer, {
      filename: file.filename,
      contentType: file.mimetype,
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
          console.log("Telegram API Response:", data);

          const parsed = JSON.parse(data);
          if (parsed.ok) {
            resolve();
          } else {
            reject(new Error(`Telegram Error: ${data}`));
          }
        });
      }
    );

    request.on("error", (err) => {
      console.error("Request error:", err);
      reject(err);
    });

    form.pipe(request);
  });
}
