import { defineConfig } from "vocs";

export default defineConfig({
  title: "Paved",
  iconUrl: "/logo.ico",
  logoUrl: "/banner.svg",
  topNav: [
    { text: "App", link: "https://paved.gg" },
    { text: "Dojo", link: "https://dojoengine.org" },
    {
      text: "Realms World",
      link: "https://realms.world",
    },
  ],
  font: {
    google: "RubikMonoOne",
  },
  sidebar: [
    {
      text: "About",
      collapsed: false,
      items: [
        {
          text: "Introduction",
          link: "/intro",
        },],
    },
    {
      text: "Player setup",
      collapsed: false,
      items: [
        {
          text: "Wallet",
          link: "/wallet",
        },
        {
          text: "Spawn",
          link: "/spawn",
        },
        {
          text: "Purchase",
          link: "/purchase",
        },
      ],
    },
    {
      text: "Lobby",
      collapsed: false,
      items: [
        {
          text: "Create",
          link: "/create",
        },
        {
          text: "Join",
          link: "/join",
        },
        {
          text: "Spectate",
          link: "/spectate",
        },
      ],
    },
    {
      text: "Play",
      collapsed: false,
      items: [
        {
          text: "Reveal",
          link: "/reveal",
        },
        {
          text: "Rotate",
          link: "/rotate",
        },
        {
          text: "Place",
          link: "/place",
        },
        {
          text: "Character",
          link: "/character",
        },
        {
          text: "Pave",
          link: "/confirm",
        },
        {
          text: "Camera",
          link: "/camera",
        },
      ],
    },
    {
      text: "Rules",
      collapsed: false,
      items: [
        {
          text: "Aim",
          link: "/aim",
        },
        {
          text: "Structures",
          link: "/structures",
        },
        {
          text: "Deck",
          link: "/deck",
        },
        {
          text: "Characters",
          link: "/characters",
        },
        {
          text: "Allegiance",
          link: "/allegience",
        },
        {
          text: "Scoring",
          link: "/scoring",
        },
      ],
    },
  ],
  editLink: {
    pattern:
      "https://github.com/stolslilabs/paved",
    text: "Edit on GitHub",
  },
  description: "Paved in order!",
  sponsors: [
    {
      name: "Funded by",
      height: 60,
      items: [
        [
          {
            name: "Realms World",
            link: "https://realms.world",
            image: "/realms.svg",
          },
        ],
      ],
    },
    {
      name: "Built with",
      height: 60,
      items: [
        [
          {
            name: "Cartridge",
            link: "https://cartridge.gg/",
            image: "/cartridge.svg",
          },
          {
            name: "Starknet",
            link: "https://starknet.io/",
            image: "/starknet.svg",
          },
        ],
      ],
    },
  ],
});
