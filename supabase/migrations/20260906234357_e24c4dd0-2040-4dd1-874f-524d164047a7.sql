CREATE POLICY "Drivers can view stops of their routes"
ON public.route_stops FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.route_schedules rs
   WHERE rs.id = route_stops.route_id AND rs.driver_id = auth.uid()
));