import { parseMultipartFormData } from "@netlify/functions";
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

  try {
    const formData = await parseMultipartFormData(event);

    const { name, phone, email, role, resume, id_front, id_back } = formData;

    const message = `📥 *New Application Received*\n\n👤 *Name*: ${name}\n📞 *Phone*: ${phone}\n📧 *Email*: ${email}\n💼 *Role*: ${role}`;
    await sendTelegramMessage(message);

    // Send files if present
    const fileFields = [resume, id_front, id_back];
    for (const file of fileFields) {
      if (file && file.content) {
        await sendTelegramFile(file.filename, file.contentType, file.content);
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error("Error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: "Upload failed" }),
    };
  }
};

function sendTelegramMessage(text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage?chat_id=${CHAT_ID}&text=${encodeURIComponent(
    text
  )}&parse_mode=Markdown`;

  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        res.on("data", () => {}); // discard response body
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
