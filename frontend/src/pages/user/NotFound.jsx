import { Link } from "react-router-dom";
import StoreLayout from "../../components/StoreLayout";
import usePageTitle from "../../hooks/usePageTitle";

export default function NotFound() {
  usePageTitle("Page not found");
  return (
    <StoreLayout>
      <div className="vx-page">
        <div className="vx-state">
          <strong>Page not found</strong>
          <p>The page you are looking for doesn’t exist or has moved.</p>
          <Link to="/products" className="vx-btn-dark">Browse products</Link>
          <Link to="/" className="vx-btn-dark">Back to home</Link>
        </div>
      </div>
    </StoreLayout>
  );
}
