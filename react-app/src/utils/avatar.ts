// const IPFS_GATEWAY = "https://ipfs.io/ipfs";

export const getAvatar = async (data: any) => {
  if (data !== undefined) {
    if (data.profile?.includes("base64")) {
      // TODO: Very specific to blobert on chain data, need more cases to find a generic way to handle this
      const profileData = data.profile.split(",")[1].slice(0, -1);
      const profile = JSON.parse(atob(profileData));
      return profile.image;
    }

    // if (data.profile?.includes("ipfs://")) {
    //   const url = `${IPFS_GATEWAY}/${data.profile.replace("ipfs://", "")}`;
    //   return url;
    // }

    if (data.profilePicture?.toLowerCase().includes("error")) {
      return null;
    }

    return data.profilePicture;
  }

  return null;
};
