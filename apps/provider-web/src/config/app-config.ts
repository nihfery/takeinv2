import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();
const providerConsoleUrl = process.env.NEXT_PUBLIC_PROVIDER_CONSOLE_URL ?? "http://127.0.0.1:5175";

export const APP_CONFIG = {
  name: "Takein Provider",
  version: packageJson.version,
  copyright: `© ${currentYear}, Takein.`,
  meta: {
    title: "Takein Provider Dashboard | Salon & Branch Operations",
    description:
      "Manage salon bookings, branches, services, staff, customers, schedules, and provider operations securely with the Takein Provider Dashboard.",
    url: providerConsoleUrl,
  },
};
