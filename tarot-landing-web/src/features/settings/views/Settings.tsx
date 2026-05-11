import React, { useState, useEffect } from "react";
import { Icon } from "@iconify/react";
import { PrimaryTable, type Column } from "../../../components/Table/PrimaryTable";
import SettingModal from "../../../components/modals/SettingModal";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { settingsApi } from "../api/settingsApi";
import type { Setting } from "../types/settings.types";
import { useToast } from "../../../components/Toast";

const getSettingLabel = (key: string): string => {
  const labels: Record<string, string> = {
    unit_price_cents: "Price of Points (in cents)",
    stripe_api_key: "Stripe API Key",
    privacy_policy: "Privacy Policy",
    terms_of_service: "Terms of Service",
  };
  return labels[key] || key;
};

const getSettingDescription = (key: string): string => {
  const descriptions: Record<string, string> = {
    unit_price_cents: "The price of one point in cents (e.g., 100 = $1.00)",
    stripe_api_key: "Your Stripe secret API key for payment processing",
    privacy_policy: "Privacy policy content in Markdown format",
    terms_of_service: "Terms of service content in Markdown format",
  };
  return descriptions[key] || "";
};

const isLongText = (key: string): boolean => {
  return key === "privacy_policy" || key === "terms_of_service";
};

const Settings = () => {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSetting, setSelectedSetting] = useState<Setting | null>(null);

  const toast = useToast();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await settingsApi.getSettings();
      setSettings(data.settings);
    } catch (err: any) {
      console.error("Error fetching settings:", err);
      const errorMessage = err.response?.data?.message || err.response?.data?.detail || err.message || "Failed to load settings. Please try again.";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (key: string, value: string) => {
    try {
      const updated = await settingsApi.updateSetting(key, { value });
      setSettings(settings.map((s) => (s.key === key ? updated : s)));
      toast.success("Setting updated successfully!");
    } catch (err: any) {
      console.error("Error updating setting:", err);
      const errorMessage = err.response?.data?.message || err.response?.data?.detail || err.message || "Failed to update setting";
      toast.error(errorMessage);
      throw err;
    }
  };

  const columns: Column<Setting>[] = [
    {
      key: "label",
      label: "Setting",
      render: (setting) => (
        <div className="flex flex-col gap-1">
          <span className="text-white font-bold leading-tight" style={{ fontSize: TYPOGRAPHY.fontSize.sm }}>
            {getSettingLabel(setting.key)}
          </span>
          <span style={{ color: COLORS.neutralGray, fontSize: "9px" }} className="uppercase font-black tracking-widest opacity-60">
            {getSettingDescription(setting.key)}
          </span>
        </div>
      ),
    },
    {
      key: "key",
      label: "Key",
      sortable: true,
      render: (setting) => (
        <code
          className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold"
          style={{
            backgroundColor: `${COLORS.neutralWhite}08`,
            color: COLORS.neutralGray,
            border: `1px solid ${COLORS.neutralDarkGray}`,
          }}
        >
          {setting.key}
        </code>
      ),
    },
    {
      key: "value",
      label: "Current Value",
      render: (setting) => (
        <div
          className="font-mono text-xs overflow-hidden text-ellipsis max-w-xs"
          style={{ color: COLORS.neutralWhite }}
        >
          {setting.key === "stripe_api_key" ? (
            <span className="tracking-widest">••••••••••••••••••••••••••••</span>
          ) : isLongText(setting.key) ? (
            <span className="text-[10px] text-white/40 italic">
              {setting.value.length > 100
                ? setting.value.substring(0, 100) + "..."
                : setting.value}
            </span>
          ) : (
            <span className="text-white/80">{setting.value}</span>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="p-12 min-h-screen" style={{ backgroundColor: COLORS.dark, fontFamily: TYPOGRAPHY.fontFamily.body }}>
      {/* Header */}
      <div className="mb-12 flex justify-between items-end">
        <div>
          <h1 style={TYPOGRAPHY.headings.h2} className="uppercase italic tracking-tighter">
            System <span style={{ color: COLORS.primary }}>Settings</span>
          </h1>
          <p style={{ color: COLORS.neutralGray }} className="text-[10px] font-bold uppercase tracking-[0.5em] mt-2 opacity-50">
            Manage system settings including pricing and API keys
          </p>
        </div>
        <div className="flex items-center gap-4 text-white/10 font-black text-[9px] uppercase tracking-widest">
          <span>Total Settings: {settings.length}</span>
        </div>
      </div>

      {/* Loading/Error States */}
      {loading && (
        <div className="text-center py-12">
          <Icon icon="solar:load-minimalistic-bold-duotone" className="text-4xl text-primary animate-spin mx-auto mb-4" />
          <p className="text-white/40 text-sm uppercase tracking-widest">Loading settings...</p>
        </div>
      )}

      {error && (
        <div className="text-center py-12 px-6 rounded-2xl border border-red-500/20 bg-red-500/5 mb-6">
          <Icon icon="solar:danger-triangle-bold-duotone" className="text-4xl text-red-500 mx-auto mb-4" />
          <p className="text-red-400 text-sm mb-4">{error}</p>
          <button
            onClick={fetchSettings}
            className="px-6 py-2 rounded-lg font-semibold transition-colors"
            style={{ backgroundColor: COLORS.primary, color: "white" }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Table Section */}
      {!loading && !error && (
        <div className="rounded-[32px] overflow-hidden border border-white/5 bg-transparent shadow-[0_30px_60px_rgba(0,0,0,0.4)]">
          <PrimaryTable
            title="SYSTEM CONFIGURATION"
            data={settings}
            columns={columns}
            searchEnabled={false}
            actionsColumn={(setting) => (
              <div className="flex items-center justify-end gap-1 pr-4">
                <button
                  className="p-3 rounded-xl text-white/20 hover:text-primary hover:bg-primary/5 transition-all"
                  onClick={() => {
                    setSelectedSetting(setting);
                    setModalOpen(true);
                  }}
                  title="Edit Setting"
                >
                  <Icon icon="solar:pen-new-round-bold-duotone" className="text-lg" />
                </button>
              </div>
            )}
          />
        </div>
      )}

      {/* Edit Setting Modal */}
      <SettingModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setSelectedSetting(null); }}
        onSave={handleSave}
        setting={selectedSetting}
      />
    </div>
  );
};

export default Settings;
