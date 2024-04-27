import background from "/assets/loading.png";
import logo from "/assets/loading-logo.png";
import { Loader } from "../components/Loader";

export const GameLoading = () => {
  return (
    <div className="relative h-screen overflow-clip">
      {/* Background */}
      <div
        className="absolute inset-0 bg-cover bg-center animate-[pulse_30s_ease-in-out_infinite]"
        style={{ backgroundImage: `url('${background}')` }}
      />

      {/* Loader */}
      <div className="absolute inset-0 flex justify-center items-center bg-black bg-opacity-50">
        {/* Logo */}
        <div className="absolute top-1/4 left-0 flex justify-center items-center w-full h-20">
          <img src={logo} alt="banner" className="h-12 md:h-40" />
        </div>

        <div className="text-white text-center">
          <div className="mt-4">
            <Loader />
          </div>
        </div>
      </div>
    </div>
  );
};
