import { useState, useMemo, useCallback } from "react";
import { FORMATS, SWITCHES, KEYCAPS, OPTIONS, calculatePrice } from "../data/keyboard-data.js";

const DEFAULT_CONFIG = {
  formatId: "65",
  switchId: "brown",
  keycapId: "obsidian",
  optionIds: [],
};

export function useConfigurator() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);

  const setFormat = useCallback((formatId) => {
    setConfig((c) => ({ ...c, formatId }));
  }, []);

  const setSwitch = useCallback((switchId) => {
    setConfig((c) => ({ ...c, switchId }));
  }, []);

  const setKeycap = useCallback((keycapId) => {
    setConfig((c) => ({ ...c, keycapId }));
  }, []);

  const toggleOption = useCallback((optionId) => {
    setConfig((c) => ({
      ...c,
      optionIds: c.optionIds.includes(optionId)
        ? c.optionIds.filter((id) => id !== optionId)
        : [...c.optionIds, optionId],
    }));
  }, []);

  const price = useMemo(() => calculatePrice(config), [config]);

  const format = useMemo(() => FORMATS.find((f) => f.id === config.formatId), [config.formatId]);
  const switchData = useMemo(() => SWITCHES.find((s) => s.id === config.switchId), [config.switchId]);
  const keycap = useMemo(() => KEYCAPS.find((k) => k.id === config.keycapId), [config.keycapId]);
  const selectedOptions = useMemo(
    () => OPTIONS.filter((o) => config.optionIds.includes(o.id)),
    [config.optionIds]
  );

  return {
    config,
    price,
    format,
    switchData,
    keycap,
    selectedOptions,
    setFormat,
    setSwitch,
    setKeycap,
    toggleOption,
  };
}