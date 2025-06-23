// /netlify/functions/submit.js
import { Buffer } from "buffer";
import { Readable } from "stream";
import formidable from "formidable";
import https from "https";
import FormData from "form-data";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

function bufferToStream(buffer) {
  return new Readable({
    read() {
      this.push(buffer);
      this.push(null);
    },
  });
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed",
    };
  }

  const contentType =
    event.headers["content-type"] || event.headers["Content-Type"];

  const form = formidable({
    multiples: true,
    keepExtensions: true,
  });

  return new Promise((resolve, reject) => {
    const stream = bufferToStream(
      event.isBase64Encoded
        ? Buffer.from(event.body, "base64")
        : Buffer.from(event.body, "utf8")
    );

    stream.headers = {
      "content-type": contentType,
    };

    form.parse(stream, async (err, fields, files) => {
      if (err) {
        console.error("Form parse error:", err);
        return resolve({
          statusCode: 400,
          body: JSON.stringify({
            success: false,
            error: "Form parsing failed",
          }),
        });
      }

      const { name, phone, email, role } = fields;

      const message = `📥 *New Application Received*\n\n👤 *Name*: ${name}\n📞 *Phone*: ${phone}\n📧 *Email*: ${email}\n💼 *Role*: ${role}`;
      try {
        await sendTelegramMessage(message);

        const fileFields = ["resume", "id_front", "id_back"];

        for (const field of fileFields) {
          const file = files[field];
          if (file && file.filepath && file.originalFilename) {
            const buffer = await fs.promises.readFile(file.filepath);
            await sendTelegramFile(
              file.originalFilename,
              file.mimetype,
              buffer
            );
          }
        }

        return resolve({
          statusCode: 200,
          body: JSON.stringify({ success: true }),
        });
      } catch (err) {
        console.error("Telegram error:", err);
        return resolve({
          statusCode: 500,
          body: JSON.stringify({
            success: false,
            error: "Telegram send failed",
          }),
        });
      }
    });
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
    form.append("document", buffer, {
      filename,
      contentType: mimetype,
    });

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
            const result = JSON.parse(data);
            if (result.ok) resolve();
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

import fs from "fs";
