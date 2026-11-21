const User = require("../models/User");
const mongoose = require("mongoose");


const getAllUsers = async (req, res) => {
  try {
    // Pagination
    const rawPage = Number(req.query.page);

    const page =
      Number.isSafeInteger(rawPage) && rawPage > 0
        ? Math.min(rawPage, 100000)
        : 1;

    const limit = 10;

    // Search
    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim().slice(0, 100)
        : "";

    // Status filter
    const status =
      typeof req.query.status === "string"
        ? req.query.status
        : "all";

    // Only customers
    const filter = {
      role: "user",
    };


    if (search) {
      // Escape special regex characters
      const escapedSearch = search.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

      filter.$or = [
        {
          name: {
            $regex: escapedSearch,
            $options: "i",
          },
        },
        {
          email: {
            $regex: escapedSearch,
            $options: "i",
          },
        },
        {
          phone: {
            $regex: escapedSearch,
            $options: "i",
          },
        },
      ];
    }


    if (status === "active") {
      filter.isBlocked = { $ne: true };
    } else if (status === "blocked") {
      filter.isBlocked = true;
    } else if (status !== "all") {
      return res.status(400).json({
        success: false,
        message: "Invalid status filter",
      });
    }


    const totalUsers = await User.countDocuments(filter);

    const totalPages = Math.ceil(totalUsers / limit);

    const safePage =
      totalPages > 0
        ? Math.min(page, totalPages)
        : 1;


    const users = await User.find(filter)
      .select("name email phone isBlocked createdAt")
      .sort({
        createdAt: -1,
        _id: -1,
      })
      .skip((safePage - 1) * limit)
      .limit(limit)
      .lean();


    return res.status(200).json({
      success: true,

      users,

      pagination: {
        currentPage: safePage,
        totalPages,
        totalUsers,
        limit,
      },
    });

  } catch (error) {
    console.error("Get All Users Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch users",
    });
  }
};


const updateUserBlockStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { isBlocked } = req.body || {};



    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }


    if (typeof isBlocked !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isBlocked must be true or false",
      });
    }

  

    const user = await User.findOneAndUpdate(
      {
        _id: userId,
        role: "user",
      },
      {
        $set: {
          isBlocked,
        },
      },
      {
        returnDocument: "after",
        runValidators: true,
      }
    ).select("name email isBlocked");

    // User not found
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }


    return res.status(200).json({
      success: true,

      message: isBlocked
        ? "User blocked successfully"
        : "User unblocked successfully",

      user,
    });

  } catch (error) {
    console.error(
      "Update User Block Status Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to update user status",
    });
  }
};

const exportUsersCSV = async (req, res) => {
  try {
    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim().slice(0, 100)
        : "";

    const status =
      typeof req.query.status === "string"
        ? req.query.status
        : "all";

    const filter = { role: "user" };

    if (search) {
      const escapedSearch = search.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

      filter.$or = [
        { name: { $regex: escapedSearch, $options: "i" } },
        { email: { $regex: escapedSearch, $options: "i" } },
        { phone: { $regex: escapedSearch, $options: "i" } },
      ];
    }

    if (status === "active") {
      filter.isBlocked = { $ne: true };
    } else if (status === "blocked") {
      filter.isBlocked = true;
    } else if (status !== "all") {
      return res.status(400).json({
        success: false,
        message: "Invalid status filter",
      });
    }

    const escapeCSV = (value) => {
      const text = String(value ?? "");

      // Prevent spreadsheet formula injection.
      const safeText = /^[\s]*[=+\-@\t\r\n]/.test(text)
        ? `'${text}`
        : text;

      return `"${safeText.replace(/"/g, '""')}"`;
    };

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="voltix-users.csv"'
    );
    res.setHeader("Cache-Control", "no-store");

    // UTF-8 BOM helps Excel display text correctly.
    res.write("\uFEFF");

    res.write(
      "Name,Email,Phone,Joined Date,Status\r\n"
    );

    const cursor = User.find(filter)
      .select("name email phone createdAt isBlocked")
      .sort({ createdAt: -1, _id: -1 })
      .lean()
      .cursor();

    for await (const user of cursor) {
      const row = [
        user.name,
        user.email,
        user.phone,
        user.createdAt
          ? new Date(user.createdAt).toISOString().slice(0, 10)
          : "",
        user.isBlocked ? "Blocked" : "Active",
      ];

      res.write(row.map(escapeCSV).join(",") + "\r\n");
    }

    res.end();
  } catch (error) {
    console.error("Export Users CSV Error:", error);

    if (res.headersSent) {
      return res.destroy(error);
    }

    return res.status(500).json({
      success: false,
      message: "Failed to export users",
    });
  }
};

module.exports = {
  getAllUsers,
  updateUserBlockStatus,
  exportUsersCSV,
};