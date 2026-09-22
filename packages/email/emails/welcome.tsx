import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from "@react-email/components";

export default function WelcomeEmail({ name = "there" }: { name?: string }) {
  return (
    <Html lang="en">
      <Head />
      <Preview>A little practice. A little more confidence.</Preview>
      <Body
        style={{ backgroundColor: "#f7f7f7", fontFamily: "Arial, sans-serif" }}
      >
        <Container style={{ padding: "32px", backgroundColor: "#ffffff" }}>
          <Heading>Welcome to Chitchat, {name}.</Heading>
          <Text>
            A place to practise the little conversations that make everyday life
            feel more connected.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
