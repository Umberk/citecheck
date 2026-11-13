import { Button } from "antd";
import { Compass } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "../components/States";
import { useT } from "../i18n";

export default function NotFoundPage() {
  const t = useT();
  const navigate = useNavigate();
  return (
    <div className="flex h-full items-center justify-center">
      <EmptyState
        icon={<Compass size={20} />}
        title={t("notFound.title")}
        action={
          <Button type="primary" onClick={() => navigate("/dashboard")}>
            {t("notFound.back")}
          </Button>
        }
      />
    </div>
  );
}
