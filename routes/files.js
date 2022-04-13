const router = require("express").Router();
const multer = require("multer");
const path = require("path");
const File = require("../models/file");
const { v4: uuidv4 } = require("uuid");
const fetch = require("node-fetch-commonjs");

let storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(
      Math.random() * 1e9
    )}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

let upload = multer({ storage, limits: { fileSize: 1000000 * 100 } }).single(
  "myfile"
); //100mb

const tinyurl = async (resp, url) => {
  fetch("https://api.tinyurl.com/create", {
    method: "POST",
    body: JSON.stringify({
      url: url,
      api_token: process.env.API_TOKEN,
    }),
    headers: { "Content-Type": "application/json" },
  })
    .then((res) => res.json())
    .then((res) => {
      resp.json({ file1: url, file2: res.data.tiny_url });
    });
};

router.post("/", (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(500).send({ error: err.message });
    }
    const file = new File({
      filename: req.file.filename,
      uuid: uuidv4(),
      path: req.file.path,
      size: req.file.size,
    });
    const response = await file.save();
    const url = `${process.env.APP_BASE_URL}/files/${response.uuid}`;
    tinyurl(res, url);
  });
});

router.post("/send", async (req, res) => {
  const { uuid, emailTo, senderName } = req.body;
  if (!uuid || !emailTo || !senderName) {
    return res.status(422).send({ error: "All fields are required !!" });
  }
  // Get data from db
  try {
    const file = await File.findOne({ uuid: uuid });
    if (file.sender) {
      return res.status(422).send({ error: "Email already sent once." });
    }
    file.sender = senderName;
    file.receiver = emailTo;
    const response = await file.save();
    // send mail
    const sendMail = require("../services/mailService");
    sendMail({
      from: process.env.MAIL_USER,
      to: emailTo,
      subject: "NShare file sharing service",
      text: `${senderName} shared a file with you.`,
      html: require("../services/emailTemplate")({
        senderName,
        downloadLink: `${process.env.APP_BASE_URL}/files/${file.uuid}?source=email`,
        size: parseInt(file.size / 1000) + " KB",
        expires: "24 hours",
      }),
    })
      .then(() => {
        return res.json({ success: true });
      })
      .catch((err) => {
        return res.status(500).json({ error: "Error in email sending." });
      });
  } catch (err) {
    return res.status(500).send({ error: "Something went wrong." });
  }
});

module.exports = router;
