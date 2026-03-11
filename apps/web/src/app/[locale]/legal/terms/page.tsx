"use client";

import { LegalPage } from "../legal-page";

const SECTIONS = [
  { title: "termsServiceTitle", body: "termsServiceBody" },
  { title: "termsUserTitle", body: "termsUserBody" },
  { title: "termsDisclaimerTitle", body: "termsDisclaimerBody" },
  { title: "termsIpTitle", body: "termsIpBody" },
  { title: "termsTerminationTitle", body: "termsTerminationBody" },
  { title: "termsDataTitle", body: "termsDataBody" },
  { title: "termsChangesTitle", body: "termsChangesBody" },
];

export default function TermsPage() {
  return (
    <LegalPage
      titleKey="termsTitle"
      updatedKey="termsLastUpdated"
      introKey="termsIntro"
      sections={SECTIONS}
    />
  );
}
