json.settings do
  @settings.each do |setting|
    json.set! setting.key, setting.masked_value
  end
end
