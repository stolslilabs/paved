export const formatTime = (date: Date) => {
    // Get hours, minutes, and seconds from the Date object
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const seconds = date.getSeconds().toString().padStart(2, "0");

    // Format the time as hh:mm:ss
    return `${hours}:${minutes}:${seconds}`;
}

export const formatTimeUntil = (targetDate: Date) => {
    const now = new Date(); // Get the current date
    let diff = targetDate.getTime() - now.getTime(); // Calculate the difference in milliseconds

    // If the time has already passed, return "00:00:00"
    if (diff <= 0) {
        return "00:00:00";
    }

    // Convert milliseconds to seconds
    diff = Math.floor(diff / 1000);

    // Calculate hours, minutes, and seconds
    const hours = Math.floor(diff / 3600).toString().padStart(2, "0");
    const minutes = Math.floor((diff % 3600) / 60).toString().padStart(2, "0");
    const seconds = (diff % 60).toString().padStart(2, "0");

    // Return the formatted time as hh:mm:ss
    return `${hours}:${minutes}:${seconds}`;
};
