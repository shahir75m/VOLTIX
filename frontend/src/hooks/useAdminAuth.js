import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAdminSession, refreshAdminSession, adminSessionRefreshDelay, hasAdminSession, invalidateAdminSession } from "../utils/adminSession";

export default function useAdminAuth() {
  const navigate = useNavigate();
  const [checkingAuth, setCheckingAuth] = useState(() => !hasAdminSession());
  useEffect(() => {
    let active = true;
    let timer;
    const check = async (refresh = false) => {
      try {
        await (refresh ? refreshAdminSession() : getAdminSession());
        if (!active) return;
        setCheckingAuth(false);
        timer = setTimeout(() => check(true), adminSessionRefreshDelay());
      } catch {
        if (!active) return;
        invalidateAdminSession();
        navigate("/admin/login", { replace: true });
      }
    };
    check();
    return () => { active = false; clearTimeout(timer); };
  }, [navigate]);
  const handleAuthError = useCallback((error) => {
    if (error?.status === 401 || error?.status === 403) {
      invalidateAdminSession();
      navigate("/admin/login", { replace: true });
      return true;
    }
    return false;
  }, [navigate]);
  return { checkingAuth, handleAuthError };
}
