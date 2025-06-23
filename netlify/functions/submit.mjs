import Busboy from "busboy";
import https from "https";
import { Buffer } from "buffer";

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
    const busboy = Busboy({ headers: event.headers }); // note: no `new` here
    const formData = {};
    const files = [];

    busboy.on("field", (fieldname, value) => {
      formData[fieldname] = value;
    });

    busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
      const buffers = [];
      file.on("data", (data) => buffers.push(data));
      file.on("end", () => {
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

      const message = `\n\n📥 *New Application Received*\n\n👤 *Name*: ${name}\n📞 *Phone*: ${phone}\n📧 *Email*: ${email}\n💼 *Role*: ${role}`;

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

    busboy.end(Buffer.from(event.body, "base64"));
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
    const boundary = "--------------------------" + Date.now().toString(16);

    const payloadParts = [
      `--${boundary}`,
      `Content-Disposition: form-data; name=\"chat_id\"\r\n\r\n${CHAT_ID}`,
      `--${boundary}`,
      `Content-Disposition: form-data; name=\"document\"; filename=\"${file.filename}\"`,
      `Content-Type: ${file.mimetype}\r\n`,
      file.buffer,
      `--${boundary}--`,
    ];

    const body = Buffer.concat(
      payloadParts.map((part) =>
        typeof part === "string" ? Buffer.from(part + "\r\n") : part
      )
    );

    const options = {
      hostname: "api.telegram.org",
      path: `/bot${BOT_TOKEN}/sendDocument`,
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": body.length,
      },
    };

    const req = https.request(options, (res) => {
      res.on("data", () => {});
      res.on("end", resolve);
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}
