import {
  faDiscord,
  faXTwitter,
  faYoutube,
} from "@fortawesome/free-brands-svg-icons";
import { faBookBible } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export const Links = () => {
  const links = [
    {
      name: "Docs",
      url: "https://docs.paved.gg/",
      icon: faBookBible,
    },
    {
      name: "Youtube",
      url: "https://www.youtube.com/watch?v=_MgR12TISUY",
      icon: faYoutube,
    },
    {
      name: "Twitter",
      url: "https://twitter.com/pavedgame",
      icon: faXTwitter,
    },
    {
      name: "Discord",
      url: "https://discord.gg/DXz9xEm5",
      icon: faDiscord,
    },
  ];

  return (
    <div className="flex justify-center gap-4 mt-4">
      {links.map((link, index) => (
        <a
          key={index}
          className="flex justify-center items-center hover:scale-105 duration-200"
          href={link.url}
          target="_blank"
        >
          <FontAwesomeIcon
            icon={link.icon}
            className="h-8 fill-paved-brown stroke-paved-brown"
          />
        </a>
      ))}
    </div>
  );
};
