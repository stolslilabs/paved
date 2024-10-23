import { Button } from "@/ui/elements/button";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod"

import { z } from "zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/ui/elements/form";
import { Input } from "@/ui/elements/input";
import { useDojo } from "@/dojo/useDojo";
import { Mode, ModeType } from "@/dojo/game/types/mode";
import { AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/ui/elements/alert-dialog";
import { AlertDialogAction } from "@radix-ui/react-alert-dialog";

const formSchema = z.object({
    name: z.coerce.string()
        .min(1, "Name must contain at least 1 character(s)")
        .max(19, "Name must contain at most 19 character(s)")
        .refine(
            (value) => !/^\d+$/.test(value),
            { message: "Name cannot consist of only numbers" }
        ),
    duration: z.coerce.number()
        .int("Duration must be a whole number")
        .positive("Duration must be a positive number")
        .min(60, "Duration must be at least 60 seconds")
        .max(86400, "Duration must be at most 86400 seconds (1 week)"),
    price: z.coerce.number()
        .nonnegative("Entry price cannot be negative")
        .min(1, "Entry price must be at least 1 L")
        .max(10_000, "Entry price must be at most 10,000 L")
        .refine((val) => val !== null, "Entry price is required"),
})


export const DuelCreateDialogContent = ({ playerName, setOpen }: { playerName: string, setOpen: React.Dispatch<React.SetStateAction<boolean>> }) => {
    const {
        account: { account },
        setup: {
            systemCalls: { create_game },
        },
    } = useDojo();

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: `${playerName}'s Game`,
            duration: 600,
            price: 1
        },
        mode: "onChange"
    })

    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        const gameValues = {
            ...values,
            price: BigInt(Math.floor(values.price * 1e18))
        };
        await create_game({
            account: account,
            mode: new Mode(ModeType.Duel),
            ...gameValues
        });
    }

    const handleClick = () => setOpen(false)

    return (
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Create Duel Game</AlertDialogTitle>
                <AlertDialogDescription>
                    Fill in the information below to create your Duel game.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8  tracking-wider">
                    <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Game Name</FormLabel>
                                <FormControl>
                                    <Input type="text" defaultValue={form.formState.defaultValues?.name} {...field} />
                                </FormControl>
                                <FormDescription>
                                    This is the name the game will be listed with.
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="duration"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Duration (Seconds)</FormLabel>
                                <FormControl>
                                    <Input type="number" defaultValue={form.formState.defaultValues?.duration} {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="price"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Entry Price</FormLabel>
                                <FormControl>
                                    <Input type="number" defaultValue={form.formState.defaultValues?.price} {...field} />
                                </FormControl>
                                <FormDescription>
                                    The price players must pay to enter the game.
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={handleClick}>Cancel</AlertDialogCancel>
                        <AlertDialogAction asChild>
                            <Button type="submit" onClick={handleClick} disabled={!form.formState.isValid}>
                                Create
                            </Button>
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </form>
            </Form>
        </AlertDialogContent>
    )
}