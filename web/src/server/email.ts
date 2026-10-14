import "server-only";

/**
 * Email delivery. Uses SMTP when SMTP_URL is configured.
 * Without SMTP: in development the message is printed to the server log (so password reset can be tested);
 * in production, sending reports `delivered: false` and the UI says email isn't configured.
 */
export async function sendEmail(to: string, subject: string, text: string): Promise<{ delivered: boolean }> {
  const smtp = process.env.SMTP_URL;
  if (smtp) {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport(smtp);
    await transport.sendMail({ from: process.env.EMAIL_FROM || "no-reply@localhost", to, subject, text });
    return { delivered: true };
  }
  if (process.env.NODE_ENV !== "production") {
    console.info(`\n[email:dev] To: ${to}\nSubject: ${subject}\n\n${text}\n`);
    return { delivered: true };
  }
  console.warn("[email] SMTP_URL not configured; email not sent.");
  return { delivered: false };
}

export const emailConfigured = () => Boolean(process.env.SMTP_URL) || process.env.NODE_ENV !== "production";
