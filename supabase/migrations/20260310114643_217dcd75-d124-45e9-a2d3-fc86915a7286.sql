ALTER TABLE public.multiplayer_rooms ADD COLUMN room_code TEXT UNIQUE;

-- Function to generate a random 6-char uppercase code
CREATE OR REPLACE FUNCTION public.generate_room_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
BEGIN
  LOOP
    new_code := upper(substr(md5(random()::text), 1, 6));
    SELECT EXISTS(SELECT 1 FROM public.multiplayer_rooms WHERE room_code = new_code) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;
  NEW.room_code := new_code;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_room_code
BEFORE INSERT ON public.multiplayer_rooms
FOR EACH ROW
EXECUTE FUNCTION public.generate_room_code();