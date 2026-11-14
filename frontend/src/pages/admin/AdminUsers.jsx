import useAdminAuth from "../../hooks/useAdminAuth";
import AdminPagePending from "../../components/AdminPagePending";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import BrandLogo from "../../components/BrandLogo";

import { API_BASE_URL } from "../../config/api";
import "./AdminDashboard.css";
import "./AdminUsers.css";
import Icon from "../../components/Icon";

const menuItems = [
  "Dashboard",
  "Products",
  "Categories & brands",
  "Orders",
  "Returns",
  "Coupons",
  "Offers",
  "Users",
];

function AdminUsers() {
  const navigate = useNavigate();
  const { checkingAuth, handleAuthError } = useAdminAuth();
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [actionError, setActionError] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalUsers: 0,
    limit: 10,
  });

  // ADMIN AUTHENTICATION
  
useEffect(() => {
  const timer = setTimeout(() => {
    setDebouncedSearch(search);
  }, 400);

  return () => clearTimeout(timer);
}, [search]);

  // FETCH USERS

  useEffect(() => {
    if (checkingAuth) return;

    const controller = new AbortController();

    const fetchUsers = async () => {
      try {
        setUsersLoading(true);
        setUsersError("");

        const response = await fetch(
          `${API_BASE_URL}/api/admin/users?page=${page}&search=${encodeURIComponent(debouncedSearch)}&status=${statusFilter}`,
          {
            credentials: "include",
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          if (handleAuthError({ status: response.status })) return;
          throw new Error("Failed to fetch users");
        }

        const data = await response.json();

        setUsers(data.users || []);

        if (data.pagination) {
          setPagination(data.pagination);
          if (data.pagination.currentPage !== page) {
            setPage(data.pagination.currentPage);
          }
        }
      } catch (error) {
        if (error.name !== "AbortError") {
          setUsersError(error.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setUsersLoading(false);
        }
      }
    };

    fetchUsers();

    return () => controller.abort();
  }, [checkingAuth, page, debouncedSearch, statusFilter, handleAuthError]);

  // Users are already filtered by MongoDB.
const filteredUsers = users;

  const formatDate = (date) => {
    if (!date) return "—";

    return new Date(date).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const getInitials = (name = "") => {
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase();
  };

  const handleNavigation = (item) => {
    if (item === "Dashboard") {
      navigate("/admin/dashboard");
    }

    if (item === "Users") {
      navigate("/admin/users");
    }

    if (item === "Products") {
      navigate("/admin/products");
    }

    if (item === "Categories & brands") {
      navigate("/admin/categories");
    }
  };

  const handleBlockStatus = async () => {
  if (!selectedUser || updatingStatus) return;

  const userId = selectedUser._id;
  const newStatus = !selectedUser.isBlocked;

  try {
    setUpdatingStatus(true);
    setActionError("");

    const response = await fetch(
      `${API_BASE_URL}/api/admin/users/${userId}/block-status`,
      {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          isBlocked: newStatus,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(
        data.message || "Failed to update user status"
      );
    }

    // Update the table immediately
    setUsers((previousUsers) =>
      previousUsers.map((user) =>
        user._id === userId
          ? { ...user, isBlocked: data.user.isBlocked }
          : user
      )
    );

    setSelectedUser(null);
  } catch (error) {
    setActionError(error.message);
  } finally {
    setUpdatingStatus(false);
  }
};
   
   const handleExportCSV = async () => {
  if (exporting) return;

  try {
    setExporting(true);
    setExportError("");

    const params = new URLSearchParams({
      search: search.trim(),
      status: statusFilter,
    });

    const response = await fetch(
      `${API_BASE_URL}/api/admin/users/export?${params.toString()}`,
      {
        method: "GET",
        credentials: "include",
      }
    );

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error("Admin session expired or access denied");
      }

      throw new Error("Failed to export users");
    }

    const blob = await response.blob();

    const url = window.URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = `voltix-users-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    document.body.appendChild(link);

    link.click();
    link.remove();

    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error("CSV Export Error:", error);
    setExportError(error.message);
  } finally {
    setExporting(false);
  }
};

  if (checkingAuth) return <AdminPagePending active="Users" />;

  return (
    <div className="voltix-admin-layout">

      {/* SIDEBAR */}

      <aside className="voltix-admin-sidebar">

        <div className="voltix-sidebar-brand">
          <BrandLogo />
          <p>Admin panel</p>
        </div>

        <nav className="voltix-sidebar-menu">
          {menuItems.map((item) => (
            <button
              key={item}
              type="button"
              className={
                item === "Users"
                  ? "voltix-menu-item active"
                  : "voltix-menu-item"
              }
              onClick={() => handleNavigation(item)}
            >
              {item}
            </button>
          ))}
        </nav>

        <div className="voltix-sidebar-bottom">
          <button
            type="button"
            className="voltix-view-store"
            onClick={() => navigate("/")}
          >
            <Icon name="arrow-left" size={15} /> View store
          </button>
        </div>

      </aside>

      {/* MAIN CONTENT */}

      <main className="voltix-admin-main voltix-users-main">

        {/* HEADER */}

        <header className="voltix-users-header">

          <div>
            <h1>Users</h1>
            <p>
              View customers and manage account access —{" "}
              {pagination.totalUsers} users
            </p>
          </div>

          <button
            type="button"
            className="voltix-users-export-btn"
            onClick={handleExportCSV}
            disabled={exporting}
            title="Export users to CSV"
          >
            {exporting ? "Exporting..." : "Export CSV"}
          </button>

          {exportError && (
  <p role="alert" style={{ color: "#dc2626" }}>
    {exportError}
  </p>
)}

        </header>

        {/* FILTERS */}

        <section className="voltix-users-filters">

          <div className="voltix-users-filter-field">
            <label htmlFor="voltix-user-search">
              Search
            </label>

            <div className="voltix-users-search-row">
              <input
                id="voltix-user-search"
                type="text"
                placeholder="Name, email or phone"
                value={search}
               onChange={(event) => {
  setPage(1);
  setSearch(event.target.value);
}}
              />

              {search && (
                <button
                  type="button"
                  onClick={() => {
  setPage(1);
  setSearch("");
}}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          
          <div className="voltix-users-filter-field">
            <label htmlFor="voltix-user-status">
              Status
            </label>

            <select
              id="voltix-user-status"
              value={statusFilter}
              onChange={(event) => {
  setPage(1);
  setStatusFilter(event.target.value);
}}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>

        </section>

        {/* USERS TABLE */}

        <section className="voltix-users-table-card">

          {usersLoading && users.length === 0 ? (
            <p className="voltix-users-message">
              Loading users...
            </p>
          ) : usersError ? (
            <p className="voltix-users-message" role="alert">
              {usersError}
            </p>
          ) : filteredUsers.length === 0 ? (
            <p className="voltix-users-message">
              No users found.
            </p>
          ) : (
            <div className="voltix-users-table-scroll">

              <table className="voltix-users-table">

                <thead>
  <tr>
    <th>User</th>
    <th>Email</th>
    <th>Phone</th>
    <th>Joined</th>
    <th>Status</th>
    <th>Action</th>
  </tr>
</thead>

                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user._id}>

                      <td>
                        <div className="voltix-users-person">

                          <div className="voltix-users-avatar">
                            {getInitials(user.name)}
                          </div>

                          <div className="voltix-users-person-info">
  <strong>{user.name}</strong>
</div>

                        </div>
                      </td>
                      <td>{user.email || "—"}</td>
                      <td>{user.phone || "—"}</td>

                      <td>{formatDate(user.createdAt)}</td>

                      <td>
                        <span
                          className={
                            user.isBlocked
                              ? "voltix-users-status blocked"
                              : "voltix-users-status active"
                          }
                        >
                          {user.isBlocked ? "Blocked" : "Active"}
                        </span>
                      </td>

                      <td>
  <button
    type="button"
    className={
      user.isBlocked
        ? "voltix-users-unblock-btn"
        : "voltix-users-block-btn"
    }
    onClick={() => {
  setActionError("");
  setSelectedUser(user);
}}
  >
    {user.isBlocked ? "Unblock" : "Block"}
  </button>
</td>

                    </tr>
                  ))}
                </tbody>

              </table>

            </div>
          )}

          {/* PAGINATION */}

          <div className="voltix-users-pagination">

            <span>
              Page {pagination.currentPage} of{" "}
              {Math.max(1, pagination.totalPages)} ·{" "}
              {pagination.totalUsers} users
            </span>

            <div className="voltix-users-page-buttons">

              <button
                type="button"
                disabled={page <= 1 || usersLoading}
                onClick={() => setPage((prev) => prev - 1)}
              >
                ‹
              </button>

              <span>{page}</span>

              <button
                type="button"
                disabled={
                  usersLoading ||
                  page >= pagination.totalPages
                }
                onClick={() => setPage((prev) => prev + 1)}
              >
                ›
              </button>

            </div>

          </div>

                </section>

      </main>

      {/* BLOCK / UNBLOCK CONFIRMATION POPUP */}

      {selectedUser && (
        <div className="voltix-users-modal-overlay">
          <div
            className="voltix-users-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="voltix-block-dialog-title"
          >
            <h2 id="voltix-block-dialog-title">
              {selectedUser.isBlocked
                ? "Unblock User?"
                : "Block User?"}
            </h2>

            <p>
              Are you sure you want to{" "}
              {selectedUser.isBlocked ? "unblock" : "block"}{" "}
              <strong>{selectedUser.name}</strong>?
            </p>

            {actionError && (
              <p
                className="voltix-users-modal-error"
                role="alert"
              >
                {actionError}
              </p>
            )}

            <div className="voltix-users-modal-actions">

              <button
                type="button"
                disabled={updatingStatus}
                onClick={() => {
                  setSelectedUser(null);
                  setActionError("");
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                className="voltix-users-modal-confirm"
                disabled={updatingStatus}
                onClick={handleBlockStatus}
              >
                {updatingStatus
                  ? "Updating..."
                  : selectedUser.isBlocked
                    ? "Yes, Unblock"
                    : "Yes, Block"}
              </button>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default AdminUsers;
