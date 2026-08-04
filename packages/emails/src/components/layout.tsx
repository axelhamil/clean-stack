import type { ReactNode } from "react";
import { Body, Container, Head, Html, Preview, Section, Text } from "react-email";

interface EmailLayoutProps {
  preview: string;
  children: ReactNode;
}

export function EmailLayout({ preview, children }: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#f6f6f6", fontFamily: "system-ui, sans-serif" }}>
        <Container style={{ backgroundColor: "#ffffff", padding: "32px", borderRadius: "8px" }}>
          <Section>{children}</Section>
          <Text style={{ color: "#888", fontSize: "12px" }}>
            If you did not expect this email, you can ignore it.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
