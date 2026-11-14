const { Readable } = require("node:stream");
const User = require("../models/User");
const cloudinary = require("../config/cloudinary");

// UPLOAD OR CHANGE PROFILE IMAGE
const uploadProfileImage = async (req, res) => {
  let uploadedPublicId = null;

  try {
    // 1. Check uploaded file
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please select a profile image",
      });
    }

    // 2. Check actual image format (file signature)
    const buffer = req.file.buffer;

    const isJPEG =
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff;

    const isPNG =
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
      );

    const isWebP =
      buffer.length >= 12 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP";

    if (!isJPEG && !isPNG && !isWebP) {
      return res.status(400).json({
        success: false,
        message: "Invalid image file",
      });
    }

    // 3. Find logged-in user
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    const oldPublicId = user.profileImage?.publicId;

    // 4. Upload image to Cloudinary
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: "voltix/profile-images",
          resource_type: "image",
          transformation: [
            {
              width: 500,
              height: 500,
              crop: "fill",
              gravity: "auto",
              quality: "auto",
            },
          ],
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      );

      Readable.from(buffer).pipe(uploadStream);
    });

    uploadedPublicId = result.public_id;

    // 5. Save new image details in MongoDB
    user.profileImage = {
      url: result.secure_url,
      publicId: result.public_id,
    };

    await user.save();

    // 6. Delete previous image after successful save
    if (oldPublicId) {
      try {
        await cloudinary.uploader.destroy(oldPublicId);
      } catch (cleanupError) {
        console.error(
          "Old Profile Image Cleanup Error:",
          cleanupError
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: "Profile image updated successfully",
      profileImage: user.profileImage,
    });
  } catch (error) {
    console.error("Profile Image Upload Error:", error);

    // Remove newly uploaded image if database save failed
    if (uploadedPublicId) {
      try {
        await cloudinary.uploader.destroy(uploadedPublicId);
      } catch (cleanupError) {
        console.error(
          "Uploaded Image Cleanup Error:",
          cleanupError
        );
      }
    }

    return res.status(500).json({
      success: false,
      message: "Failed to upload profile image",
    });
  }
};

// REMOVE PROFILE IMAGE
const removeProfileImage = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const oldPublicId = user.profileImage?.publicId;

    if (!oldPublicId) {
      return res.status(400).json({
        success: false,
        message: "No profile image to remove",
      });
    }

    // Clear profile image from MongoDB
    user.profileImage = {
      url: "",
      publicId: "",
    };

    await user.save();

    // Delete old image from Cloudinary
    try {
      await cloudinary.uploader.destroy(oldPublicId);
    } catch (error) {
      console.error("Cloudinary Delete Error:", error);
    }

    return res.status(200).json({
      success: true,
      message: "Profile image removed successfully",
      profileImage: user.profileImage,
    });
  } catch (error) {
    console.error("Remove Profile Image Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to remove profile image",
    });
  }
};

module.exports = {
  uploadProfileImage,
  removeProfileImage,
};