import Busboy from "busboy";
import { Buffer } from "buffer";
import https from "https";
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

  const contentType =
    event.headers["content-type"] || event.headers["Content-Type"];

  const buffer = Buffer.from(
    event.body,
    event.isBase64Encoded ? "base64" : "utf8"
  );

  const fields = {};
  const files = {};

  return new Promise((resolve, reject) => {
    const busboy = new Busboy({ headers: { "content-type": contentType } });

    busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
      const chunks = [];

      file.on("data", (data) => chunks.push(data));
      file.on("end", () => {
        files[fieldname] = {
          filename,
          mimetype,
          buffer: Buffer.concat(chunks),
        };
      });
    });

    busboy.on("field", (fieldname, value) => {
      fields[fieldname] = value;
    });

    busboy.on("finish", async () => {
      const { name, phone, email, role } = fields;
      const message = `📥 *New Application Received*\n\n👤 *Name*: ${name}\n📞 *Phone*: ${phone}\n📧 *Email*: ${email}\n💼 *Role*: ${role}`;

      try {
        await sendTelegramMessage(message);

        const fileFields = ["resume", "id_front", "id_back"];
        for (const field of fileFields) {
          const file = files[field];
          if (file) {
            await sendTelegramFile(file.filename, file.mimetype, file.buffer);
          }
        }

        resolve({
          statusCode: 200,
          body: JSON.stringify({ success: true }),
        });
      } catch (error) {
        console.error("Telegram error:", error);
        resolve({
          statusCode: 500,
          body: JSON.stringify({ success: false, error: "Telegram failed" }),
        });
      }
    });

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

function sendTelegramFile(filename, mimetype, buffer) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("chat_id", CHAT_ID);
    form.append("document", buffer, { filename, contentType: mimetype });

    const req = https.request(
      {
        method: "POST",
        host: "api.telegram.org",
        path: `/bot${BOT_TOKEN}/sendDocument`,
        headers: form.getHeaders(),
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (json.ok) resolve();
            else reject(new Error(data));
          } catch (err) {
            reject(err);
          }
        });
      }
    );

    form.pipe(req);
    req.on("error", reject);
  });
}
