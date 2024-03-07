import banner from "/assets/banner.svg";

export function Banner() {
  return (
    <div className="absolute top-0 left-0 flex justify-center items-center w-full h-40 opacity-20">
      <img src={banner} alt="banner" className="w-full h-full" />
    </div>
  );
}
