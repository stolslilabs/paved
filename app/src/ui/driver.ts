import { driver } from "driver.js";

export const driverObj = driver({
    showProgress: false,
    allowClose: false,
    steps: [
        { element: '#burger-menu', popover: { title: 'Title', description: 'Description' } },
        { element: '#deck-composition', popover: { title: 'Title', description: 'Description' } },
        { element: '#character-menu', popover: { title: 'Title', description: 'Description' } },
        { element: '#tile-preview', popover: { title: 'Title', description: 'Description' } },
        { element: '#tile-controls', popover: { title: 'Title', description: 'Description' } },
    ]
});
