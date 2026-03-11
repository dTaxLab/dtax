"use client";

import { LegalPage } from "../legal-page";

const SECTIONS = [
  { title: "privacyCollectTitle", body: "privacyCollectBody" },
  { title: "privacyNotCollectTitle", body: "privacyNotCollectBody" },
  { title: "privacyUseTitle", body: "privacyUseBody" },
  { title: "privacyStorageTitle", body: "privacyStorageBody" },
  { title: "privacySelfHostTitle", body: "privacySelfHostBody" },
  { title: "privacyThirdPartyTitle", body: "privacyThirdPartyBody" },
  { title: "privacyCookieTitle", body: "privacyCookieBody" },
  { title: "privacyRightsTitle", body: "privacyRightsBody" },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      titleKey="privacyTitle"
      updatedKey="privacyLastUpdated"
      introKey="privacyIntro"
      sections={SECTIONS}
    />
  );
}
