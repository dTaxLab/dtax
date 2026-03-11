"use client";

import { LegalPage } from "../legal-page";

const SECTIONS = [
  { title: "disclaimerNotAdviceTitle", body: "disclaimerNotAdviceBody" },
  { title: "disclaimerConsultTitle", body: "disclaimerConsultBody" },
  { title: "disclaimerAccuracyTitle", body: "disclaimerAccuracyBody" },
  { title: "disclaimerLiabilityTitle", body: "disclaimerLiabilityBody" },
  { title: "disclaimerIrsTitle", body: "disclaimerIrsBody" },
];

export default function DisclaimerPage() {
  return (
    <LegalPage
      titleKey="disclaimerTitle"
      updatedKey="disclaimerLastUpdated"
      introKey="disclaimerIntro"
      sections={SECTIONS}
    />
  );
}
