import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vitality — health, fitness & nutrition",
    short_name: "Vitality",
    description: "Nutrition, training, sports, sleep and wellbeing in one private, AI-assisted app.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f6",
    theme_color: "#0f766e",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
