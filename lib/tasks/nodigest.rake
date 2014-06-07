namespace :assets do
  task :nodigest do
    assets_path = File.join(Rails.root, 'public', Rails.configuration.assets.prefix)
    Rails.configuration.assets.nodigest.each do |asset|
      source = File.join("app/assets/javascripts", asset)
      dest = File.join(assets_path, asset)
      FileUtils.copy_file(source, dest)
    end
    Rails.configuration.assets.nodigest_fonts.each do |asset|
      source = File.join("vendor/assets/fonts/bootstrap", asset)
      dest = File.join(assets_path, "bootstrap", asset)
      FileUtils.copy_file(source, dest)
    end
  end
end