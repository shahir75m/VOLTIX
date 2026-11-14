const { Readable } = require("node:stream");
const cloudinary = require("../config/cloudinary");

// Check the real file signature (the browser-sent mimetype can be faked)
const detectImageType = (buffer) => {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "png";
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  )
    return "webp";
  return null;
};

const uploadBuffer = (buffer, folder, transformation) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image", transformation },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    Readable.from(buffer).pipe(stream);
  });

const destroyImages = async (publicIds = []) => {
  await Promise.all(
    publicIds
      .filter(Boolean)
      .map((id) =>
        cloudinary.uploader.destroy(id).catch((e) => console.error("Cloudinary cleanup error:", e.message))
      )
  );
};

module.exports = { detectImageType, uploadBuffer, destroyImages };
