export enum Scenes {
    Main = "Main",
}

export enum Maps {
    Main = "Main",
}

export enum Animations {
    One = "One",
    Two = "Two",
    Three = "Three",
    Four = "Four",
    Five = "Five",
    Six = "Six",
    Seven = "Seven",
    Eight = "Eight",
    Nine = "Nine",
    Ten = "Ten",
    Eleven = "Eleven",
    Twelve = "Twelve",
    Thirteen = "Thirteen",
    Fourteen = "Fourteen",
    Fifteen = "Fifteen",
    Sixteen = "Sixteen",
    Seventeen = "Seventeen",
    Eighteen = "Eighteen",
    Nineteen = "Nineteen",
    Twenty = "Twenty",
}

// image addresses

export enum Sprites {
    One,
    Two,
    Three,
    Four,
    Five,
    Six,
    Seven,
    Eight,
    Nine,
    Ten,
    Eleven,
    Twelve,
    Thirteen,
    Fourteen,
    Fifteen,
    Sixteen,
    Seventeen,
    Eighteen,
    Nineteen,
    Twenty,
}

export const ImagePaths: { [key in Sprites]: string } = {
    [Sprites.One]: "01.png",
    [Sprites.Two]: "02.png",
    [Sprites.Three]: "03.png",
    [Sprites.Four]: "04.png",
    [Sprites.Five]: "05.png",
    [Sprites.Six]: "06.png",
    [Sprites.Seven]: "07.png",
    [Sprites.Eight]: "08.png",
    [Sprites.Nine]: "09.png",
    [Sprites.Ten]: "10.png",
    [Sprites.Eleven]: "11.png",
    [Sprites.Twelve]: "12.png",
    [Sprites.Thirteen]: "13.png",
    [Sprites.Fourteen]: "14.png",
    [Sprites.Fifteen]: "15.png",
    [Sprites.Sixteen]: "16.png",
    [Sprites.Seventeen]: "17.png",
    [Sprites.Eighteen]: "18.png",
    [Sprites.Nineteen]: "19.png",
    [Sprites.Twenty]: "20.png",
};

export enum Assets {
    MainAtlas = "MainAtlas",
    Tileset = "Tileset",
}

export enum Direction {
    Unknown,
    Up,
    Down,
    Left,
    Right,
}

export const TILE_HEIGHT = 32;
export const TILE_WIDTH = 32;

// contract offset so we don't overflow
export const ORIGIN_OFFSET = 100;

export const MAP_AMPLITUDE = 16;
