import { defineConfig } from "vocs";

export default defineConfig({
  title: "Paved",
  iconUrl: "logo.ico",
  logoUrl: "banner.svg",
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
      text: "Player Setup",
      collapsed: true,
      items: [
        {
          text: "Log In",
          link: "/wallet",
        },
        {
          text: "Spawn",
          link: "/spawn",
        },
        {
          text: "Purchase - Coming Soon",
          link: "/purchase",
        },
      ],
    },
    {
      text: "Game Setup",
      collapsed: true,
      items: [
        {
          text: "Puzzle & Solo",
          link: "/create",
        },
        {
          text: "Multiplayer",
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
      collapsed: true,
      items: [
         {
          text: "Place",
          link: "/place",
        },
        {
          text: "Rotate",
          link: "/rotate",
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
      collapsed: true,
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
  ogImageUrl: 'https://paved.gg/assets/logo.png',
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
