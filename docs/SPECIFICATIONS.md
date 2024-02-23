# Specifications

## Use cases

Use cases describe the expected actions we want each role to have.

The __Visitor__ is a user which coming to the app for the first time.

The __Player__ is an already registered user.

The __Builder__ is a player inside a game.

### Visitor

As a visitor:
- I can create a __Player__ with a __name__ attached to the account address.

### Player

As a player:
- I can _rename_ the __Player:name__ attribute.
- I can _buy_ new tiles to increase my __Player:bank__ balance.
- I can _create_ a new __Game__ with an __endtime__, by default I am the __Game:host__.
- I can _update_ the __Game:endtime__ if I am the __Game:host__ and the __Game__ has not started yet.
- I can _join_ a __Game__ which will create me a __Builder__ associated to the __Game:id__ and my __Player:id__ while specifying an __Order__ if the __Game__ has not yet started.
- I can _transfer_ the __Game:host__ role to another __Builder__ belonging to the __Game__.
- I can _leave_ a __Game__ if I am not the __Game:host__.
- I can _start_ a __Game__ not already started if I am the __Game:host__.
- I can _claim_ my reward if a __Game__ is over.

### Builder

As a builder:
- I can _draw_ a __Tile__ which will reduce my __Player:bank__ balance.
- I can _discard_ a drawed __Tile__.
- I can _build_ a drawed __Tile__ and adding a __Character__ on a __Tile:spot__ if it is allowed.