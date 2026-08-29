import type { TFunction } from "i18next";
import type { ReactNode } from "react";
import { Body, Container, Head, Html, Preview, Section, Text } from "react-email";

interface EmailLayoutProps {
  preview: string;
  t: TFunction<"emails">;
  children: ReactNode;
}

export function EmailLayout({ preview, t, children }: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#f6f6f6", fontFamily: "system-ui, sans-serif" }}>
        <Container style={{ backgroundColor: "#ffffff", padding: "32px", borderRadius: "8px" }}>
          <Section>{children}</Section>
          <Text style={{ color: "#888", fontSize: "12px" }}>{t("layout.footer")}</Text>
        </Container>
      </Body>
    </Html>
  );
}
