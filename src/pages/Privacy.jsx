import React from "react";
import LegalLayout, { LegalSection } from "../components/LegalLayout";

export default function Privacy() {
  return (
    <LegalLayout title="Privacy Policy" updated="September 27, 2026">
      <LegalSection title="Overview">
        <p>This policy explains what Xyron collects, why, and the choices you have. It's written to be short and plain — if anything is unclear, reach out and ask.</p>
      </LegalSection>

      <LegalSection title="Information we collect">
        <p>Account details you give us (email, and anything you add to your profile). Content you send us — messages, files, and images you upload or generate. Basic usage data (like which features you use) so we can keep the free/paid limits accurate.</p>
      </LegalSection>

      <LegalSection title="How we use it">
        <p>To run your account and remember your settings. To process your messages and generate responses. To enforce plan limits and, if you subscribe, to manage billing. We don't sell your data.</p>
      </LegalSection>

      <LegalSection title="AI processing">
        <p>Your messages are sent to the AI systems that power Xyron in order to generate a response. Avoid sharing anything sensitive you wouldn't want processed this way.</p>
      </LegalSection>

      <LegalSection title="Storage & security">
        <p>Data is stored on our servers and kept only as long as needed to provide the service. We use reasonable technical safeguards, but no system is 100% secure.</p>
      </LegalSection>

      <LegalSection title="Your choices">
        <p>You can edit or delete your profile info, clear your chats, and delete your account at any time from Settings. Deleting your account removes your stored data, other than what we're required to keep.</p>
      </LegalSection>

      <LegalSection title="Children">
        <p>Xyron isn't intended for children under 13, and we don't knowingly collect their data.</p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>We'll update the date at the top of this page if this policy changes. Continued use of Xyron after a change means you accept the update.</p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>Questions? Reach us from the Help section in Settings.</p>
      </LegalSection>
    </LegalLayout>
  );
}
