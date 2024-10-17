import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/ui/elements/dialog";
import { Button } from "@/ui/elements/button";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod"

import { z } from "zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/ui/elements/form";
import { Input } from "@/ui/elements/input";

const formSchema = z.object({
    name: z.string().min(1, "Name must contain at least 1 character(s)").max(19, "Name must contain at most 19 character(s)"),
    duration_seconds: z.coerce.number().min(60, "Duration must be at least 60 seconds").max(86400, "Duration must be at most 86400 seconds (1 week)"),
    entry_price: z.coerce.number().min(0, "Entry price must be at least 0 L").max(10_000, "Entry price must be at most 10,000 L"),
})

export const DuelDialog = ({ playerName }: { playerName: string }) => {
    const loading = false
    const disabled = false

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: `${playerName}'s Game`,
            duration_seconds: 600,
            entry_price: 0
        },
    })

    const onSubmit = (values: z.infer<typeof formSchema>) => {
        console.log(values)
    }

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button
                    className="tracking-[0.25rem] shadow-lg hover:bg-secondary text-xs lg:text-sm px-4 py-4 self-end lg:p-6"
                    loading={loading}
                    disabled={disabled}
                >
                    New Game
                </Button>
            </DialogTrigger>
            <DialogContent className="bg-primary">
                <DialogHeader>
                    <DialogTitle>Create Duel Game</DialogTitle>
                    <DialogDescription>
                        Fill in the information below to create your Duel game.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8  tracking-wider">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Game Name</FormLabel>
                                    <FormControl>
                                        <Input defaultValue={form.formState.defaultValues?.name} {...field} />
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
                            name="duration_seconds"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Duration (Seconds)</FormLabel>
                                    <FormControl>
                                        <Input type="number" defaultValue={form.formState.defaultValues?.duration_seconds} {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="entry_price"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Entry Price</FormLabel>
                                    <FormControl>
                                        <Input type="number" defaultValue={form.formState.defaultValues?.entry_price} placeholder="shadcn" {...field} />
                                    </FormControl>
                                    <FormDescription>
                                        The price players must pay to enter the game.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button>Cancel</Button>
                            </DialogClose>
                            <Button type="submit">Confirm</Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
};