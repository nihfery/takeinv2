import type { MetadataRoute } from "next";

import { APP_CONFIG } from "@/config/app-config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_CONFIG.name,
    short_name: "Takein",
    description: APP_CONFIG.meta.description,
    start_url: "/dashboard/default",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#111111",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
