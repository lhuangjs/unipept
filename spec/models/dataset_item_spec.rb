# == Schema Information
#
# Table name: dataset_items
#
#  id         :integer          not null, primary key
#  dataset_id :integer
#  name       :string(160)
#  data       :text(16777215)   not null
#  order      :integer
#

require 'spec_helper'

describe DatasetItem do
  pending "add some examples to (or delete) #{__FILE__}"
end
