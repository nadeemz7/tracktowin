"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  CompApplyScope,
  CompPayoutType,
  CompTierBasis,
  CompTierMode,
  PolicyStatus,
  PremiumCategory,
} from "@prisma/client";

type Lob = { id: string; name: string; premiumCategory: PremiumCategory };
type Product = { id: string; name: string; lobName: string; premiumCategory: PremiumCategory; productType: string };
type Bucket = { id: string; name: string; includesProducts: string[]; includesLobs: string[] };
type AdvancedRuleDraft = {
  name?: string;
  applyScope?: string;
  payoutType?: string;
  basePayoutValue?: string;
  tierMode?: string;
  tierBasis?: string;
  minThreshold?: string;
  bucketId?: string;
  productIds?: string[];
  statusOverride?: string[];
  tierMin?: string[];
  tierMax?: string[];
  tierPayout?: string[];
  tierPayoutType?: string[];
  tierRowCount?: number;
};

type AdvancedRuleBlockModalClientProps = {
  planId: string;
  lobs: Lob[];
  products: Product[];
  buckets: Bucket[];
  productUsageById: Record<string, number>;
  selectedLobId: string | "";
  addRuleBlockAction: (formData: FormData) => Promise<any>;
  onSelectedProductIdsChange?: (ids: string[]) => void;
};

const steps = ["Scope", "Products", "Payout", "Review"] as const;

type SelectionStore = { selectedIds: string[]; setSelectedIds: (ids: string[]) => void };

const SelectionStoreContext = createContext<SelectionStore | null>(null);

export function PlanBuilderSelectionProvider({ children }: { children: ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  return <SelectionStoreContext.Provider value={{ selectedIds, setSelectedIds }}>{children}</SelectionStoreContext.Provider>;
}

export function usePlanBuilderSelectionStore() {
  return useContext(SelectionStoreContext);
}

export default function AdvancedRuleBlockModalClient(props: AdvancedRuleBlockModalClientProps) {
  const { planId, lobs, products, buckets, productUsageById, addRuleBlockAction, onSelectedProductIdsChange } = props;
  const formRef = useRef<HTMLFormElement | null>(null);
  const saveTimeoutRef = useRef<number | null>(null);
  const statusTimeoutRef = useRef<number | null>(null);
  const tierRowCountRef = useRef(1);
  const [activeStep, setActiveStep] = useState(0);
  const [formTick, setFormTick] = useState(0);
  const [tierRowCount, setTierRowCount] = useState(1);
  const [searchText, setSearchText] = useState("");
  const [draftStatus, setDraftStatus] = useState<"" | "Draft saved" | "Draft restored" | "Draft cleared">("");
  const selectionStore = usePlanBuilderSelectionStore();
  const draftKey = `ttw:compbuilder:advancedDraft:v1:${planId}`;
  const summaryData = activeStep === 3 && formRef.current ? new FormData(formRef.current) : null;
  const searchValue = searchText.trim().toLowerCase();
  const filteredProducts = searchValue
    ? products.filter((product) => product.name.toLowerCase().includes(searchValue))
    : products;
  const productNameById = new Map(products.map((product) => [product.id, product.name]));
  const selectedProductIds = formRef.current
    ? Array.from(
        new Set(
          new FormData(formRef.current)
            .getAll("productIds")
            .map((value) => String(value).trim())
            .filter(Boolean),
        ),
      )
    : [];
  const selectedProductNames = selectedProductIds.map((id) => productNameById.get(id)).filter(Boolean) as string[];
  const selectedPreview = selectedProductNames.slice(0, 4);
  const selectedRemainder = selectedProductNames.length - selectedPreview.length;
  const tierModeValue = formRef.current ? String(new FormData(formRef.current).get("tierMode") || CompTierMode.NONE) : CompTierMode.NONE;
  const showTierRows = tierModeValue === CompTierMode.TIERS;
  const defaultTierPayoutType =
    formRef.current && new FormData(formRef.current).get("payoutType") === CompPayoutType.PERCENT_OF_PREMIUM
      ? CompPayoutType.PERCENT_OF_PREMIUM
      : CompPayoutType.FLAT_PER_APP;
  useEffect(() => {
    tierRowCountRef.current = tierRowCount;
  }, [tierRowCount]);
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
      if (statusTimeoutRef.current) window.clearTimeout(statusTimeoutRef.current);
    };
  }, []);
  const summaryValue = (name: string) => {
    if (!summaryData) return "—";
    const value = summaryData.get(name);
    const text = value == null ? "" : String(value).trim();
    return text === "" ? "—" : text;
  };
  const summaryCount = (name: string) => {
    if (!summaryData) return 0;
    const values = summaryData
      .getAll(name)
      .map((value) => String(value).trim())
      .filter(Boolean);
    return new Set(values).size;
  };
  const buildDraftPayload = () => {
    if (!formRef.current) return null;
    const formData = new FormData(formRef.current);
    const value = (name: string) => {
      const raw = formData.get(name);
      return raw == null ? "" : String(raw);
    };
    const values = (name: string) =>
      formData
        .getAll(name)
        .map((entry) => String(entry).trim())
        .filter(Boolean);
    const payload: AdvancedRuleDraft = {
      name: value("name"),
      applyScope: value("applyScope"),
      payoutType: value("payoutType"),
      basePayoutValue: value("basePayoutValue"),
      tierMode: value("tierMode"),
      tierBasis: value("tierBasis"),
      minThreshold: value("minThreshold"),
      bucketId: value("bucketId"),
      productIds: values("productIds"),
      statusOverride: values("statusOverride"),
      tierMin: formData.getAll("tierMin").map((entry) => String(entry)),
      tierMax: formData.getAll("tierMax").map((entry) => String(entry)),
      tierPayout: formData.getAll("tierPayout").map((entry) => String(entry)),
      tierPayoutType: formData.getAll("tierPayoutType").map((entry) => String(entry)),
      tierRowCount: Math.min(10, Math.max(1, Number(tierRowCountRef.current || 1))),
    };
    return payload;
  };
  const scheduleDraftSave = () => {
    if (typeof window === "undefined" || !formRef.current) return;
    if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = window.setTimeout(() => {
      const payload = buildDraftPayload();
      if (!payload) return;
      try {
        localStorage.setItem(draftKey, JSON.stringify(payload));
        setDraftStatus("Draft saved");
        if (statusTimeoutRef.current) window.clearTimeout(statusTimeoutRef.current);
        statusTimeoutRef.current = window.setTimeout(() => setDraftStatus(""), 2000);
      } catch {
        // Ignore storage errors
      }
    }, 600);
  };
  const syncSelectedProducts = () => {
    if (!formRef.current || (!selectionStore && !onSelectedProductIdsChange)) return;
    const formData = new FormData(formRef.current);
    const values = (name: string) =>
      formData
        .getAll(name)
        .map((value) => String(value).trim())
        .filter(Boolean);
    const selectedIds = new Set<string>(values("productIds"));
    const primaryProductId = String(formData.get("primaryProductId") || "").trim();
    if (primaryProductId) selectedIds.add(primaryProductId);
    const applyScope = String(formData.get("applyScope") || "");
    const lobIds = values("lobIds");
    const productTypes = values("productTypes");
    const premiumCategories = values("premiumCategories");
    const bucketId = String(formData.get("bucketId") || "").trim();

    if (applyScope === CompApplyScope.LOB && lobIds.length) {
      const lobNames = lobIds.map((id) => lobs.find((lob) => lob.id === id)?.name).filter(Boolean) as string[];
      products.filter((p) => lobNames.includes(p.lobName)).forEach((p) => selectedIds.add(p.id));
    } else if (applyScope === CompApplyScope.PRODUCT_TYPE && productTypes.length) {
      products.filter((p) => productTypes.includes(p.productType)).forEach((p) => selectedIds.add(p.id));
    } else if (applyScope === CompApplyScope.PREMIUM_CATEGORY && premiumCategories.length) {
      products.filter((p) => premiumCategories.includes(p.premiumCategory)).forEach((p) => selectedIds.add(p.id));
    } else if (applyScope === CompApplyScope.BUCKET && bucketId) {
      const bucket = buckets.find((b) => b.id === bucketId);
      if (bucket) {
        products
          .filter((p) => bucket.includesProducts.includes(p.name) || bucket.includesLobs.includes(p.lobName))
          .forEach((p) => selectedIds.add(p.id));
      }
    }

    const nextSelectedIds = Array.from(selectedIds);
    selectionStore?.setSelectedIds(nextSelectedIds);
    onSelectedProductIdsChange?.(nextSelectedIds);
  };
  const handleFormChange = () => {
    syncSelectedProducts();
    setFormTick((tick) => tick + 1);
    scheduleDraftSave();
  };
  const applyDraftToForm = (payload: AdvancedRuleDraft) => {
    if (!formRef.current) return;
    const form = formRef.current;
    const setValue = (name: string, nextValue: string) => {
      const field = form.querySelector(`[name="${name}"]`);
      if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) {
        field.value = nextValue;
      }
    };
    setValue("name", payload.name || "");
    setValue("applyScope", payload.applyScope || CompApplyScope.PRODUCT);
    setValue("payoutType", payload.payoutType || "");
    setValue("basePayoutValue", payload.basePayoutValue || "");
    setValue("tierMode", payload.tierMode || "");
    setValue("tierBasis", payload.tierBasis || "");
    setValue("minThreshold", payload.minThreshold || "");
    setValue("bucketId", payload.bucketId || "");

    const productSet = new Set(Array.isArray(payload.productIds) ? payload.productIds : []);
    const productChecks = Array.from(form.querySelectorAll('input[name="productIds"]')) as HTMLInputElement[];
    productChecks.forEach((checkbox) => {
      checkbox.checked = productSet.has(checkbox.value);
    });
    const statusSet = new Set(Array.isArray(payload.statusOverride) ? payload.statusOverride : []);
    const statusChecks = Array.from(form.querySelectorAll('input[name="statusOverride"]')) as HTMLInputElement[];
    statusChecks.forEach((checkbox) => {
      checkbox.checked = statusSet.has(checkbox.value);
    });

    const nextTierRowCount = Math.min(10, Math.max(1, Number(payload.tierRowCount) || 1));
    setTierRowCount(nextTierRowCount);

    requestAnimationFrame(() => {
      if (!formRef.current) return;
      const setArrayValues = (name: string, values: string[] | undefined) => {
        const inputs = Array.from(formRef.current.querySelectorAll(`[name="${name}"]`)) as (HTMLInputElement | HTMLSelectElement)[];
        inputs.forEach((input, index) => {
          const nextValue = values && values[index] != null ? values[index] : "";
          input.value = String(nextValue);
        });
      };
      setArrayValues("tierMin", Array.isArray(payload.tierMin) ? payload.tierMin : []);
      setArrayValues("tierMax", Array.isArray(payload.tierMax) ? payload.tierMax : []);
      setArrayValues("tierPayout", Array.isArray(payload.tierPayout) ? payload.tierPayout : []);
      setArrayValues("tierPayoutType", Array.isArray(payload.tierPayoutType) ? payload.tierPayoutType : []);
      syncSelectedProducts();
      setFormTick((tick) => tick + 1);
    });
  };
  const handleClearDraft = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(draftKey);
    }
    setDraftStatus("Draft cleared");
    if (!formRef.current) return;
    const form = formRef.current;
    form.reset();
    const checkboxes = Array.from(form.querySelectorAll('input[name="productIds"], input[name="statusOverride"]')) as HTMLInputElement[];
    checkboxes.forEach((checkbox) => {
      checkbox.checked = false;
    });
    const tierInputs = Array.from(
      form.querySelectorAll('input[name="tierMin"], input[name="tierMax"], input[name="tierPayout"]'),
    ) as HTMLInputElement[];
    tierInputs.forEach((input) => {
      input.value = "";
    });
    const payoutTypeValue = (form.querySelector('select[name="payoutType"]') as HTMLSelectElement | null)?.value;
    const nextTierPayoutType =
      payoutTypeValue === CompPayoutType.PERCENT_OF_PREMIUM ? CompPayoutType.PERCENT_OF_PREMIUM : CompPayoutType.FLAT_PER_APP;
    const tierPayoutTypeSelects = Array.from(form.querySelectorAll('select[name="tierPayoutType"]')) as HTMLSelectElement[];
    tierPayoutTypeSelects.forEach((select) => {
      select.value = nextTierPayoutType;
    });
    setTierRowCount(1);
    requestAnimationFrame(() => {
      syncSelectedProducts();
      setFormTick((tick) => tick + 1);
    });
  };
  const getValidation = () => {
    if (!formRef.current) return { isValid: true, messages: [] as string[] };
    const formData = new FormData(formRef.current);
    const value = (name: string) => {
      const raw = formData.get(name);
      return raw == null ? "" : String(raw).trim();
    };
    const tierMode = value("tierMode") || CompTierMode.NONE;
    const tierBasis = value("tierBasis");
    const minThresholdRaw = value("minThreshold");
    const messages: string[] = [];

    if (tierBasis && tierMode !== CompTierMode.TIERS) {
      messages.push("Tier basis requires tier mode to be set to Tiered.");
    }
    if (minThresholdRaw && !tierBasis) {
      messages.push("Minimum threshold requires a tier basis.");
    }
    if (tierMode === CompTierMode.TIERS) {
      const tierMins = formData.getAll("tierMin").map((entry) => String(entry).trim());
      const tierMaxs = formData.getAll("tierMax").map((entry) => String(entry).trim());
      const tierPayouts = formData.getAll("tierPayout").map((entry) => String(entry).trim());
      const tiers: { min: number; max: number | null; payout: number }[] = [];
      const maxLen = Math.max(tierMins.length, tierMaxs.length, tierPayouts.length);
      for (let i = 0; i < maxLen; i++) {
        const minRaw = tierMins[i] || "";
        const payoutRaw = tierPayouts[i] || "";
        if (!minRaw || !payoutRaw) continue;
        const min = Number(minRaw);
        const payout = Number(payoutRaw);
        if (Number.isNaN(min) || Number.isNaN(payout)) continue;
        const maxRaw = tierMaxs[i] || "";
        const maxValue = maxRaw === "" ? null : Number(maxRaw);
        const max = maxValue == null || Number.isNaN(maxValue) ? null : maxValue;
        tiers.push({ min, max, payout });
      }
      if (!tiers.length) {
        messages.push("Tiered rules require at least one valid tier.");
      } else {
        let invalidTiers = false;
        for (const tier of tiers) {
          if (tier.min < 0 || tier.payout < 0) {
            invalidTiers = true;
            break;
          }
          if (tier.max != null && tier.max <= tier.min) {
            invalidTiers = true;
            break;
          }
        }
        if (!invalidTiers) {
          const sorted = [...tiers].sort((a, b) => a.min - b.min);
          for (let i = 1; i < sorted.length; i++) {
            const prev = sorted[i - 1];
            const curr = sorted[i];
            if (prev.max == null || prev.max >= curr.min) {
              invalidTiers = true;
              break;
            }
          }
        }
        if (invalidTiers) {
          messages.push("Tier rows are invalid (overlap/out of order/max <= min). Fix tiers and try again.");
        }
      }
    }

    return { isValid: messages.length === 0, messages };
  };
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    const validation = getValidation();
    if (!validation.isValid) {
      event.preventDefault();
      return;
    }
    if (typeof window === "undefined") return;
    localStorage.removeItem(draftKey);
  };
  const handleInsertBreakpoint = () => {
    const applyValues = () => {
      if (!formRef.current) return;
      const tierMins = Array.from(formRef.current.querySelectorAll('input[name="tierMin"]')) as HTMLInputElement[];
      const tierMaxs = Array.from(formRef.current.querySelectorAll('input[name="tierMax"]')) as HTMLInputElement[];
      const tierPayouts = Array.from(formRef.current.querySelectorAll('input[name="tierPayout"]')) as HTMLInputElement[];
      const tierPayoutTypes = Array.from(formRef.current.querySelectorAll('select[name="tierPayoutType"]')) as HTMLSelectElement[];

      if (tierMins[0]) tierMins[0].value = "0";
      if (tierMaxs[0]) tierMaxs[0].value = "50000";
      if (tierPayouts[0]) tierPayouts[0].value = "2";
      if (tierMins[1]) tierMins[1].value = "50000";
      if (tierMaxs[1]) tierMaxs[1].value = "";
      if (tierPayouts[1]) tierPayouts[1].value = "3";
      if (tierPayoutTypes[0]) tierPayoutTypes[0].value = CompPayoutType.PERCENT_OF_PREMIUM;
      if (tierPayoutTypes[1]) tierPayoutTypes[1].value = CompPayoutType.PERCENT_OF_PREMIUM;

      handleFormChange();
    };

    if (tierRowCount < 2) {
      setTierRowCount(2);
      requestAnimationFrame(applyValues);
      return;
    }

    applyValues();
  };
  const handleSelectAllFiltered = () => {
    if (!formRef.current) return;
    const filteredIds = new Set(filteredProducts.map((product) => product.id));
    const checkboxes = Array.from(formRef.current.querySelectorAll('input[name="productIds"]')) as HTMLInputElement[];
    checkboxes.forEach((checkbox) => {
      if (filteredIds.has(checkbox.value)) checkbox.checked = true;
    });
    handleFormChange();
  };
  const handleSelectAllLob = (lobName: string) => {
    if (!formRef.current) return;
    const checkboxes = Array.from(formRef.current.querySelectorAll('input[name="productIds"]')) as HTMLInputElement[];
    const matchingIds = new Set(
      products
        .filter((product) => product.lobName === lobName && (!searchValue || product.name.toLowerCase().includes(searchValue)))
        .map((product) => product.id),
    );
    checkboxes.forEach((checkbox) => {
      if (matchingIds.has(checkbox.value)) checkbox.checked = true;
    });
    handleFormChange();
  };
  const handleClearLob = (lobName: string) => {
    if (!formRef.current) return;
    const checkboxes = Array.from(formRef.current.querySelectorAll('input[name="productIds"]')) as HTMLInputElement[];
    const matchingIds = new Set(products.filter((product) => product.lobName === lobName).map((product) => product.id));
    checkboxes.forEach((checkbox) => {
      if (matchingIds.has(checkbox.value)) checkbox.checked = false;
    });
    handleFormChange();
  };
  const handleClearProducts = () => {
    if (!formRef.current) return;
    const checkboxes = Array.from(formRef.current.querySelectorAll('input[name="productIds"]')) as HTMLInputElement[];
    checkboxes.forEach((checkbox) => {
      checkbox.checked = false;
    });
    handleFormChange();
  };
  const handleAddTier = () => {
    setTierRowCount((count) => Math.min(10, count + 1));
    setFormTick((tick) => tick + 1);
  };
  const handleClearTiers = () => {
    if (!formRef.current) return;
    const inputs = Array.from(
      formRef.current.querySelectorAll('input[name="tierMin"], input[name="tierMax"], input[name="tierPayout"]'),
    ) as HTMLInputElement[];
    inputs.forEach((input) => {
      input.value = "";
    });
    setTierRowCount(1);
    handleFormChange();
  };
  const handleToggleGroup = (groupIds: string[]) => {
    if (!formRef.current) return;
    if (groupIds.length === 0) return;
    const checkboxes = Array.from(formRef.current.querySelectorAll('input[name="productIds"]')) as HTMLInputElement[];
    const checkboxById = new Map(checkboxes.map((checkbox) => [checkbox.value, checkbox]));
    const allChecked = groupIds.every((id) => checkboxById.get(id)?.checked);
    groupIds.forEach((id) => {
      const checkbox = checkboxById.get(id);
      if (checkbox) checkbox.checked = !allChecked;
    });
    handleFormChange();
  };
  const groupIds = (predicate: (product: Product) => boolean) => products.filter(predicate).map((product) => product.id);

  const validation = useMemo(() => getValidation(), [formTick]);
  const ruleSentence = (() => {
    if (!formRef.current) {
      return { headline: "For scope, pay $0 per app.", tiers: [] as string[] };
    }

    const formData = new FormData(formRef.current);
    const value = (name: string) => {
      const raw = formData.get(name);
      return raw == null ? "" : String(raw).trim();
    };
    const values = (name: string) =>
      formData
        .getAll(name)
        .map((entry) => String(entry).trim())
        .filter(Boolean);
    const rawValues = (name: string) => formData.getAll(name).map((entry) => String(entry).trim());

    const applyScope = value("applyScope");
    const payoutType = value("payoutType");
    const basePayoutValue = value("basePayoutValue") || "0";
    const tierMode = value("tierMode");
    const tierBasis = value("tierBasis");
    const minThresholdRaw = value("minThreshold");
    const minThresholdValue = Number(minThresholdRaw);
    const hasMinThreshold = minThresholdRaw !== "" && !Number.isNaN(minThresholdValue);
    const productIds = values("productIds");
    const primaryProductId = value("primaryProductId");
    const lobIds = values("lobIds");
    const productTypes = values("productTypes");
    const premiumCategories = values("premiumCategories");

    let scopeLabel = "scope";
    if (applyScope === CompApplyScope.PRODUCT && (productIds.length || primaryProductId)) {
      scopeLabel = "selected products";
    } else if (applyScope === CompApplyScope.LOB && lobIds.length) {
      scopeLabel = "selected LoBs";
    } else if (applyScope === CompApplyScope.PRODUCT_TYPE && productTypes.length) {
      scopeLabel = "selected product types";
    } else if (applyScope === CompApplyScope.PREMIUM_CATEGORY && premiumCategories.length) {
      scopeLabel = "selected premium categories";
    } else if (applyScope === CompApplyScope.BUCKET) {
      scopeLabel = "selected bucket";
    }

    let metricLabel = "value";
    if (tierBasis === CompTierBasis.APP_COUNT) metricLabel = "apps";
    else if (tierBasis === CompTierBasis.PREMIUM_SUM) metricLabel = "combined premium";
    else if (tierBasis === CompTierBasis.BUCKET_VALUE) metricLabel = "bucket value";

    let payoutPhrase = `$${basePayoutValue} per app`;
    if (payoutType === CompPayoutType.PERCENT_OF_PREMIUM) payoutPhrase = `${basePayoutValue}% of premium`;
    else if (payoutType === CompPayoutType.FLAT_LUMP_SUM) payoutPhrase = `$${basePayoutValue} lump sum`;

    const tierMins = rawValues("tierMin");
    const tierMaxs = rawValues("tierMax");
    const tierPayouts = rawValues("tierPayout");
    const tierPayoutTypes = rawValues("tierPayoutType");
    const tiers: string[] = [];
    const maxLen = Math.max(tierMins.length, tierMaxs.length, tierPayouts.length, tierPayoutTypes.length);
    for (let i = 0; i < maxLen; i++) {
      const min = tierMins[i];
      const payout = tierPayouts[i];
      if (!min || !payout) continue;
      const max = tierMaxs[i] || "∞";
      const tierPayoutType = tierPayoutTypes[i] || payoutType;
      let payoutLabel = payout;
      if (tierPayoutType === CompPayoutType.FLAT_PER_APP) payoutLabel = `$${payout}/app`;
      else if (tierPayoutType === CompPayoutType.PERCENT_OF_PREMIUM) payoutLabel = `${payout}%`;
      else if (tierPayoutType === CompPayoutType.FLAT_LUMP_SUM) payoutLabel = `$${payout}`;
      tiers.push(`${min}–${max} => ${payoutLabel}`);
    }

    const hasTiers = tierMode === CompTierMode.TIERS && tiers.length > 0;
    const headline = hasTiers
      ? `For ${scopeLabel}, pay ${payoutPhrase} tiered on ${metricLabel}:`
      : `For ${scopeLabel}, pay ${payoutPhrase}.`;

    const maxTierLines = 5;
    const displayTiers = hasTiers ? tiers.slice(0, maxTierLines) : [];
    const extraTierCount = hasTiers ? Math.max(0, tiers.length - displayTiers.length) : 0;
    const gateLine = hasMinThreshold ? `Gate: only pays when ${metricLabel} ≥ ${minThresholdRaw}.` : "";

    return { headline, tiers: displayTiers, extraTierCount, gateLine };
  })();

  useEffect(() => {
    const handleHashChange = () => {
      if (typeof window === "undefined") return;
      if (window.location.hash !== "#add-rule") return;
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      let payload: AdvancedRuleDraft | null = null;
      try {
        payload = JSON.parse(raw) as AdvancedRuleDraft;
      } catch {
        localStorage.removeItem(draftKey);
        setDraftStatus("Draft cleared");
        return;
      }
      if (!payload || typeof payload !== "object") {
        localStorage.removeItem(draftKey);
        setDraftStatus("Draft cleared");
        return;
      }
      try {
        applyDraftToForm(payload);
        setDraftStatus("Draft restored");
      } catch {
        localStorage.removeItem(draftKey);
        setDraftStatus("Draft cleared");
      }
    };

    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [draftKey]);

  useEffect(() => {
    syncSelectedProducts();
  }, [activeStep]);

  return (
    <div id="add-rule" className="modal-target">
      <div className="modal-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>New Rule Block</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button type="button" className="btn" onClick={handleClearDraft} style={{ padding: "4px 8px", fontSize: 12 }}>
              Clear draft
            </button>
            {draftStatus ? <span style={{ fontSize: 12, color: "#64748b" }}>{draftStatus}</span> : null}
            <a href="#" style={{ textDecoration: "none", color: "#b91c1c", fontWeight: 700 }}>
              ✕ Close
            </a>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {steps.flatMap((step, index) => {
            const isActive = activeStep === index;
            const tab = (
              <button
                key={step}
                type="button"
                onClick={() => setActiveStep(index)}
                aria-current={isActive ? "step" : undefined}
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: isActive ? "1px solid #2563eb" : "1px solid #e5e7eb",
                  background: isActive ? "rgba(37,99,235,0.08)" : "white",
                  color: "#0f172a",
                  fontWeight: isActive ? 700 : 600,
                  cursor: "pointer",
                }}
              >
                {step}
              </button>
            );

            if (index === steps.length - 1) return [tab];
            return [
              tab,
              <span key={`${step}-sep`} style={{ color: "#94a3b8" }}>
                &bull;
              </span>,
            ];
          })}
        </div>
        <form action={addRuleBlockAction} style={{ display: "grid", gap: 18 }} ref={formRef} onInput={handleFormChange} onSubmit={handleSubmit}>
          <div style={{ display: activeStep === 0 ? "block" : "none" }}>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 700 }}>Step 1 • Define the rule</div>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontWeight: 600 }}>Rule name</span>
                <input name="name" required style={{ padding: 10, width: "100%" }} placeholder="e.g., Personal Raw New Auto base" />
              </label>
              <input type="hidden" name="applyScope" value={CompApplyScope.PRODUCT} />
            </div>
          </div>

          <div style={{ display: activeStep === 1 ? "block" : "none" }}>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 700 }}>Step 2 • Select scope items</div>
              <div style={{ fontSize: 12, color: "#475569" }}>
                Selected: {selectedProductIds.length} products
                {selectedPreview.length ? (
                  <span style={{ marginLeft: 8 }}>
                    {selectedPreview.join(", ")}
                    {selectedRemainder > 0 ? ` +${selectedRemainder} more` : ""}
                  </span>
                ) : null}
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: "#475569" }}>Quick selects</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" className="btn" onClick={() => handleToggleGroup(groupIds((p) => p.productType === "BUSINESS"))} style={{ padding: "4px 8px" }}>
                      Business
                    </button>
                    <button type="button" className="btn" onClick={() => handleToggleGroup(groupIds((p) => p.productType === "PERSONAL"))} style={{ padding: "4px 8px" }}>
                      Personal
                    </button>
                    <button type="button" className="btn" onClick={() => handleToggleGroup(groupIds((p) => p.premiumCategory === PremiumCategory.PC))} style={{ padding: "4px 8px" }}>
                      PC
                    </button>
                    <button type="button" className="btn" onClick={() => handleToggleGroup(groupIds((p) => p.premiumCategory === PremiumCategory.FS))} style={{ padding: "4px 8px" }}>
                      FS
                    </button>
                    <button type="button" className="btn" onClick={() => handleToggleGroup(groupIds((p) => p.premiumCategory === PremiumCategory.IPS))} style={{ padding: "4px 8px" }}>
                      IPS
                    </button>
                  </div>
                </div>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontWeight: 600 }}>Search products</span>
                  <input
                    type="text"
                    placeholder="Search by product or LoB"
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    style={{ padding: 10, width: "100%" }}
                  />
                </label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  <button type="button" className="btn" onClick={handleSelectAllFiltered} style={{ padding: "4px 8px" }}>
                    Select all (filtered)
                  </button>
                  <button type="button" className="btn" onClick={handleClearProducts} style={{ padding: "4px 8px" }}>
                    Clear
                  </button>
                </div>
                <div
                  style={{
                    marginTop: 10,
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                    gap: 10,
                  }}
                >
                  {Array.from(new Set(products.map((product) => product.lobName))).map((lobName) => {
                    const lobProducts = products.filter((product) => product.lobName === lobName);
                    const visibleCount = lobProducts.filter((product) => !searchValue || product.name.toLowerCase().includes(searchValue)).length;
                    return (
                      <div
                        key={lobName}
                        style={{
                          display: visibleCount ? "grid" : "none",
                          gap: 8,
                          border: "1px solid #e5e7eb",
                          borderRadius: 10,
                          padding: 10,
                          background: "#fff",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <div style={{ fontWeight: 700 }}>{lobName}</div>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button type="button" className="btn" onClick={() => handleSelectAllLob(lobName)} style={{ padding: "2px 8px" }}>
                              Select all
                            </button>
                            <button type="button" className="btn" onClick={() => handleClearLob(lobName)} style={{ padding: "2px 8px" }}>
                              Clear
                            </button>
                          </div>
                        </div>
                        <div style={{ display: "grid", gap: 6 }}>
                          {lobProducts.map((product) => {
                            const matches = !searchValue || product.name.toLowerCase().includes(searchValue);
                            const usageCount = productUsageById[product.id] || 0;
                            return (
                              <label
                                key={product.id}
                                style={{
                                  display: matches ? "flex" : "none",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  gap: 8,
                                  border: "1px solid #e5e7eb",
                                  borderRadius: 8,
                                  padding: "6px 8px",
                                  background: "#f8fafc",
                                }}
                              >
                                <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                                  <input type="checkbox" name="productIds" value={product.id} />
                                  <span style={{ fontWeight: 600 }}>{product.name}</span>
                                </div>
                                {usageCount > 0 ? (
                                  <span style={{ fontSize: 11, fontWeight: 700, color: "#1f2937", background: "#e5e7eb", padding: "2px 6px", borderRadius: 999 }}>
                                    Used {usageCount}
                                  </span>
                                ) : null}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: activeStep === 2 ? "block" : "none" }}>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 700 }}>Step 3 • Payout logic</div>
              <div style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                <label style={{ display: "grid", gap: 2 }}>
                  <span style={{ fontWeight: 600 }}>Payout type</span>
                  <select name="payoutType" style={{ padding: 10, width: "100%" }}>
                    <option value={CompPayoutType.FLAT_PER_APP}>Flat $ per app</option>
                    <option value={CompPayoutType.PERCENT_OF_PREMIUM}>% of premium</option>
                    <option value={CompPayoutType.FLAT_LUMP_SUM}>Flat lump sum</option>
                  </select>
                  <span style={{ fontSize: 12, color: "#555" }}>Flat/app for app tiers; % for premium tiers.</span>
                </label>
                <label style={{ display: "grid", gap: 2 }}>
                  <span style={{ fontWeight: 600 }}>Base payout value</span>
                  <input name="basePayoutValue" type="number" step="0.01" defaultValue={0} style={{ padding: 10, width: "100%" }} />
                  <span style={{ fontSize: 12, color: "#555" }}>Used when tiers are off.</span>
                </label>
                <label>
                  Use tiers?
                  <br />
                  <select name="tierMode" style={{ padding: 10, width: "100%" }}>
                    <option value={CompTierMode.NONE}>No tiers</option>
                    <option value={CompTierMode.TIERS}>Tiered</option>
                  </select>
                </label>
                <label>
                  Tier basis
                  <br />
                  <select name="tierBasis" style={{ padding: 10, width: "100%" }}>
                    <option value="">(none)</option>
                    <option value={CompTierBasis.APP_COUNT}>App count</option>
                    <option value={CompTierBasis.PREMIUM_SUM}>Premium sum</option>
                    <option value={CompTierBasis.BUCKET_VALUE}>Bucket value</option>
                  </select>
                </label>
                <label>
                  Minimum threshold (apps or premium)
                  <br />
                  <input name="minThreshold" type="number" step="0.01" placeholder="Optional" style={{ padding: 10, width: "100%" }} />
                </label>
              </div>
              {validation.messages.length ? (
                <div style={{ color: "#b45309", background: "#fef3c7", padding: "8px 10px", borderRadius: 8, border: "1px solid #fcd34d", fontSize: 12 }}>
                  {validation.messages.map((message, index) => (
                    <div key={`validation-${index}`}>{message}</div>
                  ))}
                </div>
              ) : null}
              <div style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", background: "#f8fafc", color: "#0f172a", display: "grid", gap: 6 }}>
                <div style={{ fontWeight: 700 }}>Rule sentence</div>
                <div style={{ fontSize: 13 }}>{ruleSentence.headline}</div>
                {ruleSentence.tiers.length ? (
                  <div style={{ fontSize: 12, color: "#475569", display: "grid", gap: 2 }}>
                    {ruleSentence.tiers.map((tier, idx) => (
                      <div key={`tier-sentence-${idx}`}>{tier}</div>
                    ))}
                    {ruleSentence.extraTierCount ? <div>+{ruleSentence.extraTierCount} more</div> : null}
                  </div>
                ) : null}
                {ruleSentence.gateLine ? <div style={{ fontSize: 12, color: "#475569" }}>{ruleSentence.gateLine}</div> : null}
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: "#475569" }}>Helpers</div>
                <button type="button" className="btn" onClick={handleInsertBreakpoint} style={{ justifySelf: "start", padding: "4px 8px", fontSize: 12 }}>
                  Insert 2-tier breakpoint (50k: 2% → 3%)
                </button>
              </div>
              <div style={{ display: showTierRows ? "block" : "none" }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Enter tiers (optional)</div>
                <div style={{ fontSize: 12, color: "#555", marginBottom: 6 }}>
                  Enter tiers as needed; unused rows can stay blank.
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {Array.from({ length: tierRowCount }).map((_, i) => (
                    <div key={i} style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", alignItems: "center" }}>
                      <div style={{ fontWeight: 600 }}>Tier {i + 1}</div>
                      <label style={{ display: "grid", gap: 4 }}>
                        <span style={{ fontSize: 12 }}>Min</span>
                        <input name="tierMin" type="number" step="0.01" placeholder="Min" style={{ padding: 8 }} />
                      </label>
                      <label style={{ display: "grid", gap: 4 }}>
                        <span style={{ fontSize: 12 }}>Max (blank = no cap)</span>
                        <input name="tierMax" type="number" step="0.01" placeholder="Max (blank = no cap)" style={{ padding: 8 }} />
                      </label>
                      <label style={{ display: "grid", gap: 4 }}>
                        <span style={{ fontSize: 12 }}>Payout</span>
                        <input name="tierPayout" type="number" step="0.01" placeholder="Payout" style={{ padding: 8 }} />
                      </label>
                      <label style={{ display: "grid", gap: 4 }}>
                        <span style={{ fontSize: 12 }}>Payout type</span>
                        <select name="tierPayoutType" defaultValue={defaultTierPayoutType} style={{ padding: 8 }}>
                          <option value={CompPayoutType.FLAT_PER_APP}>$ / app</option>
                          <option value={CompPayoutType.PERCENT_OF_PREMIUM}>% of premium</option>
                        </select>
                      </label>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  <button type="button" className="btn" onClick={handleAddTier} disabled={tierRowCount >= 10}>
                    + Add tier
                  </button>
                  <button type="button" className="btn" onClick={handleClearTiers}>
                    Clear tiers
                  </button>
                </div>
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Status override (optional)</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {[PolicyStatus.WRITTEN, PolicyStatus.ISSUED, PolicyStatus.PAID, PolicyStatus.STATUS_CHECK, PolicyStatus.CANCELLED].map((s) => (
                  <label key={s} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <input type="checkbox" name="statusOverride" value={s} /> {s}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: activeStep === 3 ? "block" : "none" }}>
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", background: "#f8fafc", color: "#0f172a" }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Review</div>
                <div style={{ fontSize: 13, color: "#475569" }}>Confirm scope, products, and payout settings before saving.</div>
                <div style={{ display: "grid", gap: 4, marginTop: 8, fontSize: 12 }}>
                  <div>Apply scope: {summaryValue("applyScope")}</div>
                  <div>Payout type: {summaryValue("payoutType")}</div>
                  <div>Base payout value: {summaryValue("basePayoutValue")}</div>
                  <div>Tier mode: {summaryValue("tierMode")}</div>
                  <div>Tier basis: {summaryValue("tierBasis")}</div>
                  <div>Bucket: {summaryValue("bucketId")}</div>
                  <div>Minimum threshold: {summaryValue("minThreshold")}</div>
                  <div>Products selected: {summaryCount("productIds")}</div>
                  <div>LoBs selected: {summaryCount("lobIds")}</div>
                  <div>Product types selected: {summaryCount("productTypes")}</div>
                  <div>Premium categories selected: {summaryCount("premiumCategories")}</div>
                </div>
                {!validation.isValid ? <div style={{ marginTop: 8, fontSize: 12, color: "#b45309" }}>Cannot submit yet.</div> : null}
              </div>
              <button
                type="submit"
                disabled={!validation.isValid}
                style={{
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid #283618",
                  background: "#283618",
                  color: "#f8f9fa",
                  fontWeight: 700,
                  opacity: validation.isValid ? 1 : 0.6,
                  cursor: validation.isValid ? "pointer" : "not-allowed",
                }}
              >
                Save rule block
              </button>
            </div>
          </div>

          <div style={{ display: activeStep === 3 ? "none" : "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              className="btn"
              onClick={() => setActiveStep((step) => Math.max(0, step - 1))}
              disabled={activeStep === 0}
            >
              Back
            </button>
            <button type="button" className="btn primary" onClick={() => setActiveStep((step) => Math.min(3, step + 1))}>
              Next
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
